import mongoose from "mongoose";

const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    revolutOrderId: {
      type: String,
      unique: true,
      sparse: true, // the local order is created before Revolut responds. Therefore it temporarily has no revolutOrderId
      index: true,
      trim: true,
    },

    revolutToken: {
      type: String,
      trim: true,
    },

    checkoutUrl: {
      type: String,
      trim: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
    timestamps: true,
    collection: "orders",
  },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
