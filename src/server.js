import { env } from "./config/env.js";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";

const startServer = async () => {
  try {
    await connectDatabase();

    const server = app.listen(
      env.port,
      () => {
        console.log(
          `Payment API running on port ${env.port}`
        );
      }
    );

    const shutdown = (signal) => {
      console.log(
        `${signal} received. Shutting down...`
      );

      server.close(async () => {
        await mongoose.connection.close();

        console.log(
          "Server and MongoDB connection closed."
        );

        process.exit(0);
      });
    };

    process.on(
      "SIGTERM",
      () => shutdown("SIGTERM")
    );

    process.on(
      "SIGINT",
      () => shutdown("SIGINT")
    );
  } catch (error) {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
};

startServer();