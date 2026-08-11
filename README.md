# Revolut Merchant Payment Management System

A simple RESTful API payment management system based on the Revolut Merchant API documentation. This service creates payment orders, simulates remote payment processing, tracks transaction states, executes refunds, and maintains audit history using Express and MongoDB (Mongoose).

---

## Tech Stack

* **Runtime:** Node.js (ES Modules)
* **Framework:** Express.js
* **Database:** MongoDB / Mongoose

---

## Setup & Installation

1. **Clone the repository:**
   ```
   git clone https://github.com/tasmia-rafiq/revolut-payment-api.git
   cd [revolut-payment-api]
   ```

2. **Configure environment variables:**

Duplicate the provided sample configuration file and populate your actual values:
   ```bash
   cp .env.sample .env
   ```
   Open the newly created `.env` file and add your values.

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   * **Development mode (with nodemon):**
     ```bash
     npm run dev
     ```
   * **Production mode:**
     ```bash
     npm run start
     ```
   The backend service will run at `http://localhost:5000`.

---

## API Endpoints

### 1. Create a Payment Order
* **Endpoint:** `POST /api/payments/create`
* **Payload:**
  ```json
  {
    "amount": 2500,
    "currency": "GBP"
  }
  ```

### 2. Process Payment
* **Endpoint:** `POST /api/payments/process/:orderId`
* **Description:** Simulates an external API handshake with Revolut. Updates the database order status to `PENDING`, `COMPLETED` or `FAILED`.

### 3. Get Payment Status
* **Endpoint:** `GET /api/payments/status/:orderId`
* **Description:** Performs a database lookup to retrieve the live transaction status of a specific order.

### 4. Process Refund
* **Endpoint:** `POST /api/payments/refund/:orderId`
* **Payload:**
  ```json
  {
    "amount": 2500
  }
  ```
* **Description:** Verifies original transactional integrity and transitions the order state to `REFUNDED`.

### 5. Get Payment History
* **Endpoint:** `GET /api/payments/history`
* **Description:** Fetches all historical payment order records from the database.
