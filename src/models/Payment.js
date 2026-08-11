import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    // SQL: order_id (UUID References orders(id))
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // SQL: revolut_payment_id (UUID Unique)
    revolutPaymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // SQL: payment_status (VARCHAR)
    paymentStatus: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // SQL: payment_method (VARCHAR)
    paymentMethod: {
      type: String,
      trim: true,
    },

    // SQL: amount (INTEGER)
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // SQL: currency (VARCHAR)
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // SQL: status (VARCHAR Default 'pending')
    status: {
      type: String,
      default: "pending",
      index: true,
      trim: true,
    },

    // SQL: paid_at (TIMESTAMP)
    paidAt: {
      type: Date,
    },
  },
  {
    collection: "payments",
  }
);

export const Payment = mongoose.model("Payment", paymentSchema);