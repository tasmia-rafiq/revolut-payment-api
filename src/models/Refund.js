import mongoose from "mongoose";

const { Schema } = mongoose;

const refundSchema = new Schema(
  {
    // Original/local order being refunded
    // SQL: related_order_id / order_id References orders(id)
    relatedOrderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Revolut's refund order ID
    // SQL: refund_order_id (UUID Unique)
    refundOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    status: {
      type: String,
      default: "pending",
      index: true,
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    collection: "refunds",
  }
);

export const Refund = mongoose.model("Refund", refundSchema);