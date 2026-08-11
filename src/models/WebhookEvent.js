import mongoose from "mongoose";

const { Schema } = mongoose;

const webhookEventSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    eventKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    revolutOrderId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },

    processed: {
      type: Boolean,
      default: false,
      index: true,
    },

    processedAt: {
      type: Date,
    },
  },
  {
    collection: "webhook_events",
  }
);

export const WebhookEvent = mongoose.model(
  "WebhookEvent",
  webhookEventSchema
);