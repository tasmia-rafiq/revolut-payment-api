import mongoose from "mongoose";

import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Refund } from "../models/Refund.js";
import revolutClient from "../services/revolutClient.js";

export const refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.body;

    // --------------------------------
    // Validate orderId
    // --------------------------------

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID",
      });
    }

    // --------------------------------
    // Validate refund amount
    // --------------------------------

    if (amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        error: "Refund amount is required",
      });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error:
          "Refund amount must be a positive integer in the smallest currency unit",
      });
    }

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
    // Refund is only allowed for an
    // actually completed / partially
    // refunded order.
    // --------------------------------

    if (order.status !== "completed" && order.status !== "partially_refunded") {
      return res.status(400).json({
        success: false,
        error:
          "Refund can only be requested for a completed or partially refunded order",
      });
    }

    // --------------------------------
    // Find the successful payment
    // --------------------------------

    const payment = await Payment.findOne({
      orderId: order._id,
      status: "completed",
    });

    if (!payment) {
      return res.status(400).json({
        success: false,
        error: "No completed payment found for this order",
      });
    }

    // --------------------------------
    // Make sure payment/order amounts
    // are consistent
    // --------------------------------

    const paidAmount = payment.amount;

    // --------------------------------
    // Calculate amount already refunded
    //
    // Only completed refunds count as
    // money actually returned.
    // --------------------------------

    const refundTotals = await Refund.aggregate([
      {
        $match: {
          relatedOrderId: order._id,
          status: {
            $in: ["pending", "completed"],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRefunded: {
            $sum: "$amount",
          },
        },
      },
    ]);

    const alreadyRefunded = refundTotals[0]?.totalRefunded || 0;

    const remainingRefundableAmount = paidAmount - alreadyRefunded;

    // --------------------------------
    // Prevent over-refunding
    // --------------------------------

    if (amount > remainingRefundableAmount) {
      return res.status(400).json({
        success: false,
        error: "Refund amount exceeds the remaining refundable amount",
        details: {
          paidAmount,
          alreadyRefunded,
          remainingRefundableAmount,
          requestedAmount: amount,
        },
      });
    }

    // --------------------------------
    // Call Revolut ONLY after all local
    // validation has passed.
    // --------------------------------
    const idempotencyKey = req.get("Idempotency-Key");

    const revolutRefund = await revolutClient.refund(
      order.revolutOrderId,
      {
        amount,
        currency: order.currency,
      },
      {
        idempotencyKey,
      }
    );

    // --------------------------------
    // Validate Revolut response
    // --------------------------------

    if (!revolutRefund?.id) {
      return res.status(502).json({
        success: false,
        error: "Invalid refund response received from Revolut",
      });
    }

    // --------------------------------
    // Store refund locally as PENDING.
    //
    // Revolut response does NOT mean the
    // refund is finally completed.
    // --------------------------------

    const refund = await Refund.create({
      relatedOrderId: order._id,
      refundOrderId: revolutRefund.id,
      amount: revolutRefund.amount ?? amount,
      currency: revolutRefund.currency ?? order.currency,
      status: "pending",
    });

    // --------------------------------
    // Order is now waiting for the
    // refund webhook.
    // --------------------------------

    order.status = "refund_pending";

    await order.save();

    // --------------------------------
    // Return refund reference.
    // Do not expose unnecessary Revolut
    // response data.
    // --------------------------------

    return res.status(201).json({
      success: true,
      data: {
        refundId: refund._id,
        orderId: order._id,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error("Refund payment error:", error);

    // --------------------------------
    // Duplicate Revolut refund ID
    // --------------------------------

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "This refund has already been recorded",
      });
    }

    // --------------------------------
    // Revolut API error
    // --------------------------------

    if (error.isRevolutError) {
      return res.status(error.statusCode || 502).json({
        success: false,
        error: error.message || "Revolut refund service error",
      });
    }

    // --------------------------------
    // Database failure
    // --------------------------------

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
