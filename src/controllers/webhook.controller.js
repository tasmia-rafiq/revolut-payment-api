import crypto from "crypto";

import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Refund } from "../models/Refund.js";
import { WebhookEvent } from "../models/WebhookEvent.js";

const PAYMENT_EVENTS = new Set([
  "ORDER_COMPLETED",
  "ORDER_AUTHORISED",
  "ORDER_PAYMENT_DECLINED",
  "ORDER_PAYMENT_FAILED",
  "ORDER_CANCELLED",
]);

const REFUND_EVENTS = new Set([
  "ORDER_COMPLETED",
  "ORDER_PAYMENT_DECLINED",
  "ORDER_PAYMENT_FAILED",
]);

const PAYMENT_STATUS_MAP = {
  ORDER_COMPLETED: "completed",
  ORDER_AUTHORISED: "authorised",
  ORDER_PAYMENT_DECLINED: "declined",
  ORDER_PAYMENT_FAILED: "failed",
  ORDER_CANCELLED: "cancelled",
};

const REFUND_STATUS_MAP = {
  ORDER_COMPLETED: "completed",
  ORDER_PAYMENT_DECLINED: "declined",
  ORDER_PAYMENT_FAILED: "failed",
};

export const handleRevolutWebhook = async (req, res) => {
  try {
    const payload = req.body;

    const {
      event,
      order_id: revolutOrderId,
      created_at: createdAt,
    } = payload;

    // --------------------------------
    // Validate webhook payload
    // --------------------------------

    if (!event || !revolutOrderId) {
      return res.status(400).json({
        success: false,
        error: "Invalid webhook payload",
      });
    }

    // --------------------------------
    // Ignore events that our application
    // does not process.
    // --------------------------------

    if (
      !PAYMENT_EVENTS.has(event) &&
      !REFUND_EVENTS.has(event)
    ) {
      return res.status(200).json({
        success: true,
        message: "Webhook event ignored",
      });
    }

    // --------------------------------
    // Generate deterministic event key
    // --------------------------------

    const eventKeySource = [
      event,
      revolutOrderId,
      createdAt || "",
      payload.merchant_order_ext_ref || "",
    ].join(":");

    const eventKey = crypto
      .createHash("sha256")
      .update(eventKeySource)
      .digest("hex");

    // --------------------------------
    // Determine whether this is a refund
    // order or the original payment order.
    // --------------------------------

    const refund = await Refund.findOne({
      refundOrderId: revolutOrderId,
    });

    let order;

    if (refund) {
      order = await Order.findById(
        refund.relatedOrderId
      );
    } else {
      order = await Order.findOne({
        revolutOrderId,
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: refund
          ? "Original order for refund not found"
          : "Order not found",
      });
    }

    // --------------------------------
    // Idempotency check + event logging
    //
    // eventKey has a unique index.
    // MongoDB atomically prevents duplicate
    // webhook records.
    // --------------------------------

    try {
      await WebhookEvent.create({
        eventId: order._id,
        eventKey,
        eventType: event,
        revolutOrderId,
        payload,
        processed: false,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).json({
          success: true,
          message: "Webhook event already processed",
        });
      }

      throw error;
    }

    // =========================================================
    // REFUND WEBHOOK
    // =========================================================

    if (refund) {
      if (!REFUND_EVENTS.has(event)) {
        await markWebhookProcessed(eventKey);

        return res.status(200).json({
          success: true,
          message: "Refund webhook event ignored",
        });
      }

      const refundStatus = REFUND_STATUS_MAP[event];

      refund.status = refundStatus;

      await refund.save();

      // --------------------------------
      // A completed refund means money
      // has actually been returned.
      // --------------------------------

      if (event === "ORDER_COMPLETED") {
        const totalRefunded = await getCompletedRefundAmount(
          order._id
        );

        if (totalRefunded >= order.amount) {
          order.status = "refunded";
        } else {
          order.status = "partially_refunded";
        }
      }

      // --------------------------------
      // Failed/declined refund:
      // restore order to the state that
      // reflects already completed refunds.
      // --------------------------------

      if (
        event === "ORDER_PAYMENT_DECLINED" ||
        event === "ORDER_PAYMENT_FAILED"
      ) {
        const totalRefunded = await getCompletedRefundAmount(
          order._id
        );

        order.status =
          totalRefunded > 0
            ? "partially_refunded"
            : "completed";
      }

      await order.save();

      await markWebhookProcessed(eventKey);

      return res.status(200).json({
        success: true,
        message: "Refund webhook processed successfully",
      });
    }

    // =========================================================
    // PAYMENT WEBHOOK
    // =========================================================

    const paymentStatus = PAYMENT_STATUS_MAP[event];

    if (!paymentStatus) {
      await markWebhookProcessed(eventKey);

      return res.status(200).json({
        success: true,
        message: "Webhook event ignored",
      });
    }

    const payment = await Payment.findOne({
      orderId: order._id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found for order",
      });
    }

    payment.paymentStatus = paymentStatus;
    payment.status = paymentStatus;

    if (event === "ORDER_COMPLETED") {
      payment.paidAt = new Date();
    }

    await payment.save();

    // --------------------------------
    // Webhook is the source of truth
    // for the order's payment state.
    // --------------------------------

    order.status = paymentStatus;

    await order.save();

    await markWebhookProcessed(eventKey);

    return res.status(200).json({
      success: true,
      message: "Payment webhook processed successfully",
    });
  } catch (error) {
    console.error(
      "Revolut webhook processing error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// =============================================================
// Helpers
// =============================================================

const getCompletedRefundAmount = async (orderId) => {
  const result = await Refund.aggregate([
    {
      $match: {
        relatedOrderId: orderId,
        status: "completed",
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

  return result[0]?.totalRefunded || 0;
};

const markWebhookProcessed = async (eventKey) => {
  await WebhookEvent.updateOne(
    { eventKey },
    {
      $set: {
        processed: true,
        processedAt: new Date(),
      },
    }
  );
};