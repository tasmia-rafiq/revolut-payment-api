import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import revolutClient from "../services/revolutClient.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * POST /api/payments/create
 *
 */
export const createPaymentOrder = async (req, res) => {
  try {
    const {
      amount,
      currency,
      description,
      customer,
      merchant_order_data,
      redirect_url,
    } = req.body;

    // -----------------------------
    // Validate required fields
    // -----------------------------

    if (amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        error: "Amount is required",
      });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error:
          "Amount must be a positive integer in the smallest currency unit",
      });
    }

    if (!currency || typeof currency !== "string") {
      return res.status(400).json({
        success: false,
        error: "Currency is required",
      });
    }

    if (
      !merchant_order_data ||
      typeof merchant_order_data.reference !== "string" ||
      !merchant_order_data.reference.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "merchant_order_data.reference is required",
      });
    }

    // -----------------------------
    // Extract internal order reference
    // -----------------------------

    const reference = merchant_order_data.reference.trim();

    // -----------------------------
    // Create local order first
    // -----------------------------

    const order = await Order.create({
      reference,
      customerId: req.user._id,
      amount,
      currency: currency.trim().toUpperCase(),
      status: "pending",
    });

    // -----------------------------
    // Create order on Revolut
    // -----------------------------
    const idempotencyKey = req.get("Idempotency-Key") || `payment-create-${order._id}`;

    const revolutOrder = await revolutClient.createOrder({
      amount,
      currency: currency.trim().toUpperCase(),
      description,
      customer,
      merchant_order_data: {
        reference: order._id.toString(),
      },
      redirect_url,
    }, {
      idempotencyKey,
    });

    // -----------------------------
    // Validate Revolut response
    // -----------------------------

    if (
      !revolutOrder?.id ||
      !revolutOrder?.token ||
      !revolutOrder?.checkout_url
    ) {
      return res.status(502).json({
        success: false,
        error: "Invalid response received from Revolut",
      });
    }

    // -----------------------------
    // Save Revolut order details
    // -----------------------------

    order.revolutOrderId = revolutOrder.id;
    order.revolutToken = revolutOrder.token;
    order.checkoutUrl = revolutOrder.checkout_url;
    order.status = "pending";

    await order.save();

    // -----------------------------
    // Return only required frontend data
    // -----------------------------

    return res.status(201).json({
      success: true,
      data: {
        checkout_url: order.checkoutUrl,
        orderId: order._id,
      },
    });
  } catch (error) {
    console.error("Create payment order error:", error);

    // --------------------------------
    // Validation / malformed request
    // --------------------------------

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Invalid order data",
        details: error.message,
      });
    }

    // --------------------------------
    // Duplicate order reference
    // --------------------------------

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "An order with this reference already exists",
      });
    }

    // --------------------------------
    // Revolut/API failure
    // --------------------------------

    if (error.isRevolutError) {
      return res.status(error.statusCode || 502).json({
        success: false,
        error: error.message || "Revolut payment service error",
      });
    }

    // --------------------------------
    // Unexpected/database failure
    // --------------------------------

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * POST /api/payments/process/:orderId
 *
 */

export const processPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // --------------------------------
    // Find local order
    // --------------------------------

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // --------------------------------
    // Prevent processing an already
    // completed/cancelled order
    // --------------------------------

    if (order.status === "completed") {
      return res.status(409).json({
        success: false,
        error: "Order has already been completed",
      });
    }

    if (order.status === "cancelled") {
      return res.status(409).json({
        success: false,
        error: "Order has been cancelled",
      });
    }

    if (!order.revolutOrderId) {
      return res.status(400).json({
        success: false,
        error: "Order has not been created with Revolut",
      });
    }

    // --------------------------------
    // Simulate customer completing
    // Revolut hosted checkout
    // --------------------------------
    const revolutResponse = await revolutClient.captureOrder(
      order.revolutOrderId,
      {
        idempotencyKey: `payment-capture-${order._id}`,
      }
    );

    // --------------------------------
    // DO NOT mark completed here.
    //
    // Webhook is the source of truth.
    // --------------------------------

    order.status = "processing";

    await order.save();

    // --------------------------------
    // If Revolut returned payment data,
    // create/update our Payment record.
    // --------------------------------

    if (revolutResponse?.id) {
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          orderId: order._id,
          revolutPaymentId: revolutResponse.id,
          paymentStatus: revolutResponse.state || "processing",
          paymentMethod: revolutResponse.payment_method,
          amount: revolutResponse.amount ?? order.amount,
          currency: revolutResponse.currency ?? order.currency,
          status: "processing",
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("Process payment error:", error);

    if (error.isRevolutError) {
      return res.status(error.statusCode || 502).json({
        success: false,
        error: error.message || "Revolut payment service error",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * GET /api/payments/status/:orderId
 *
 */

export const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // --------------------------------
    // Validate MongoDB ObjectId
    // --------------------------------

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID",
      });
    }

    // --------------------------------
    // Find local order
    // --------------------------------

    const order = await Order.findById(orderId).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // --------------------------------
    // Find associated local payment
    // --------------------------------

    const payment = await Payment.findOne({
      orderId: order._id,
    }).lean();

    return res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        orderStatus: order.status,
        payment: payment
          ? {
              id: payment._id,
              status: payment.status,
              paymentStatus: payment.paymentStatus,
              amount: payment.amount,
              currency: payment.currency,
              paymentMethod: payment.paymentMethod,
              paidAt: payment.paidAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get payment status error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * GET /api/payments/history
 *
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const { status, page: pageParam, limit: limitParam } = req.query;

    // --------------------------------
    // Parse pagination
    // --------------------------------

    const page = Number.parseInt(pageParam, 10) || DEFAULT_PAGE;

    const limit = Number.parseInt(limitParam, 10) || DEFAULT_LIMIT;

    // --------------------------------
    // Validate pagination
    // --------------------------------

    if (page < 1) {
      return res.status(400).json({
        success: false,
        error: "Page must be greater than or equal to 1",
      });
    }

    if (limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `Limit must be between 1 and ${MAX_LIMIT}`,
      });
    }

    const skip = (page - 1) * limit;

    // --------------------------------
    // Build order filter
    // --------------------------------

    const filter = {};

    if (status) {
      filter.status = status.trim();
    }

    // --------------------------------
    // Fetch orders and total count
    // --------------------------------

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),

      Order.countDocuments(filter),
    ]);

    // --------------------------------
    // Get payments for these orders
    // --------------------------------

    const orderIds = orders.map((order) => order._id);

    const payments = orderIds.length
      ? await Payment.find({
          orderId: { $in: orderIds },
        }).lean()
      : [];

    // --------------------------------
    // Avoid repeatedly searching the
    // payments array for every order.
    // --------------------------------

    const paymentByOrderId = new Map(
      payments.map((payment) => [payment.orderId.toString(), payment]),
    );

    // --------------------------------
    // Combine Order + Payment
    // --------------------------------

    const history = orders.map((order) => {
      const payment = paymentByOrderId.get(order._id.toString());

      return {
        orderId: order._id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,

        payment: payment
          ? {
              id: payment._id,
              status: payment.status,
              paymentStatus: payment.paymentStatus,
              paymentMethod: payment.paymentMethod,
              paidAt: payment.paidAt,
            }
          : null,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: history,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get payment history error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
