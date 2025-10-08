const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Payments API is working!");
});

/**
 * 📌 GET /api/payments
 * Lấy danh sách toàn bộ giao dịch thanh toán
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT p.*, c.full_name AS customer_name, s.subcription_name, v.code AS voucher_code
      FROM Payments p
      LEFT JOIN Customers c ON p.customer_id = c.customer_id
      LEFT JOIN Subscriptions s ON p.subcription_id = s.subcription_id
      LEFT JOIN Vouchers v ON p.voucher_id = v.voucher_id
      ORDER BY p.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /payments:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/payments/:id
 * Lấy thông tin thanh toán theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .query(`
        SELECT p.*, c.full_name AS customer_name, s.subcription_name, v.code AS voucher_code
        FROM Payments p
        LEFT JOIN Customers c ON p.customer_id = c.customer_id
        LEFT JOIN Subscriptions s ON p.subcription_id = s.subcription_id
        LEFT JOIN Vouchers v ON p.voucher_id = v.voucher_id
        WHERE p.payment_id = @payment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /payments/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/payments
 * Tạo giao dịch thanh toán mới
 * Required: subcription_id, customer_id, original_amount, payment_method, status
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const {subcription_id,customer_id, voucher_id, original_amount, discount_amount, payment_method, status, transaction_id} = req.body;

  if (!subcription_id || !customer_id || !original_amount || !payment_method || !status) {
    return res.status(400).json({ message: "Missing required fields: subcription_id, customer_id, original_amount, payment_method, status" });
  }

  const final_amount = original_amount - (discount_amount || 0);
  if (final_amount < 0) {
    return res.status(400).json({ message: "Final amount cannot be negative" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra customer_id
    const checkCustomer = await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .query("SELECT COUNT(*) AS count FROM Customers WHERE customer_id = @customer_id");
    if (checkCustomer.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid customer_id" });
    }

    // 🔍 Kiểm tra subscription_id
    const checkSub = await pool.request()
      .input("subcription_id", sql.Int, subcription_id)
      .query("SELECT COUNT(*) AS count FROM Subscriptions WHERE subcription_id = @subcription_id");
    if (checkSub.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid subcription_id" });
    }

    // 🔍 Kiểm tra voucher (nếu có)
    if (voucher_id) {
      const checkVoucher = await pool.request()
        .input("voucher_id", sql.Int, voucher_id)
        .query("SELECT COUNT(*) AS count FROM Vouchers WHERE voucher_id = @voucher_id");
      if (checkVoucher.recordset[0].count === 0) {
        return res.status(400).json({ message: "Invalid voucher_id" });
      }
    }

    // ✅ Tạo mới payment
    await pool.request()
      .input("subcription_id", sql.Int, subcription_id)
      .input("customer_id", sql.Int, customer_id)
      .input("voucher_id", sql.Int, voucher_id || null)
      .input("original_amount", sql.Decimal(10, 0), original_amount)
      .input("discount_amount", sql.Decimal(10, 0), discount_amount || 0)
      .input("final_amount", sql.Decimal(10, 0), final_amount)
      .input("currency", sql.VarChar(3), "VND")
      .input("payment_method", sql.VarChar(15), payment_method)
      .input("status", sql.NVarChar(10), status)
      .input("transaction_id", sql.NVarChar(30), transaction_id || null)
      .query(`
        INSERT INTO Payments 
        (subcription_id, customer_id, voucher_id, original_amount, discount_amount, final_amount, currency, payment_method, status, transaction_id, created_at)
        VALUES (@subcription_id, @customer_id, @voucher_id, @original_amount, @discount_amount, @final_amount, @currency, @payment_method, @status, @transaction_id, GETDATE())
      `);

    res.status(201).json({ message: "✅ Payment created successfully", final_amount });
  } catch (err) {
    console.error("❌ Error in POST /payments:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/payments/:id
 * Cập nhật thông tin giao dịch (trạng thái, phương thức, v.v.)
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { status, payment_method, transaction_id } = req.body;

  if (!status && !payment_method && !transaction_id) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .input("status", sql.NVarChar(10), status || null)
      .input("payment_method", sql.VarChar(15), payment_method || null)
      .input("transaction_id", sql.NVarChar(30), transaction_id || null)
      .query(`
        UPDATE Payments
        SET status = ISNULL(@status, status),
            payment_method = ISNULL(@payment_method, payment_method),
            transaction_id = ISNULL(@transaction_id, transaction_id)
        WHERE payment_id = @payment_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({ message: "✅ Payment updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /payments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/payments/:id
 * Xóa giao dịch thanh toán
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .query("DELETE FROM Payments WHERE payment_id = @payment_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({ message: "✅ Payment deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /payments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
