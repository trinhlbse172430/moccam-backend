const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Kiểm tra hoạt động
router.get("/ping", (req, res) => res.send("✅ Payments API is working!"));

// ⚙️ Khởi tạo PayOS client
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

/**
 * 📌 POST /api/payments/payos/create
 * Tạo liên kết thanh toán PayOS
 */
router.post(
  "/payos/create",
  verifyToken,
  authorizeRoles("admin", "employee", "customer"),
  async (req, res) => {
    const {subcription_id, user_id, voucher_id, original_amount, discount_amount} = req.body;
    if (!subcription_id || !user_id || !original_amount)
      return res
        .status(400)
        .json({
          message:
            "Missing required fields: subcription_id, user_id, original_amount",
        });

    const final_amount = original_amount - (discount_amount || 0);
    if (final_amount <= 0)
      return res
        .status(400)
        .json({ message: "Final amount must be greater than 0" });

    try {
      const pool = await poolPromise;

      // Kiểm tra user và voucher
      const checkUser = await pool
        .request()
        .input("user_id", sql.Int, user_id)
        .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");
      if (checkUser.recordset[0].count === 0)
        return res.status(400).json({ message: "Invalid user_id" });

      if (voucher_id) {
        const checkVoucher = await pool
          .request()
          .input("voucher_id", sql.Int, voucher_id)
          .query(
            "SELECT COUNT(*) AS count FROM Vouchers WHERE voucher_id = @voucher_id"
          );
        if (checkVoucher.recordset[0].count === 0)
          return res.status(400).json({ message: "Invalid voucher_id" });
      }

      const orderCode = Date.now(); // unique transaction id

      const paymentLink = await payos.paymentRequests.create({
        orderCode,
        amount: final_amount,
        description,
        returnUrl: process.env.PAYOS_RETURN_URL,
        cancelUrl: process.env.PAYOS_CANCEL_URL,
      });

      // Lưu vào DB
      await pool
        .request()
        .input("subcription_id", sql.Int, subcription_id)
        .input("user_id", sql.Int, user_id)
        .input("voucher_id", sql.Int, voucher_id || null)
        .input("original_amount", sql.Decimal(10, 0), original_amount)
        .input("discount_amount", sql.Decimal(10, 0), discount_amount || 0)
        .input("final_amount", sql.Decimal(10, 0), final_amount)
        .input("currency", sql.VarChar(3), "VND")
        .input("payment_method", sql.VarChar(15), "PayOS")
        .input("description", sql.NVarChar(25), description || null)
        .input("status", sql.NVarChar(10), "pending")
        .input("transaction_id", sql.NVarChar(50), orderCode.toString())
        .query(`
          INSERT INTO Payments 
          (subcription_id, user_id, voucher_id, original_amount, discount_amount, final_amount, currency, payment_method, description, status, transaction_id, created_at)
          VALUES (@subcription_id, @user_id, @voucher_id, @original_amount, @discount_amount, @final_amount, @currency, @payment_method, @description, @status, @transaction_id, GETDATE())
        `);

      res.json({
        message: "✅ PayOS payment link created successfully",
        checkoutUrl: paymentLink.checkoutUrl,
        orderCode,
      });
    } catch (err) {
      console.error("❌ Error in /payos/create:", err.message);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

/**
 * 📌 GET /api/payments/payos/return
 * Khi thanh toán thành công, cập nhật trạng thái trong DB
 */
router.get("/payos/return", async (req, res) => {
  try {
    const { orderCode, status } = req.query;

    if (!orderCode)
      return res.status(400).json({ message: "Missing orderCode" });

    const pool = await poolPromise;

    // Cập nhật DB trực tiếp tại đây
    let paymentStatus = "failed";
    if (status?.toUpperCase() === "PAID") paymentStatus = "success";
    else if (status?.toUpperCase() === "CANCELLED") paymentStatus = "cancelled";

    await pool
      .request()
      .input("transaction_id", sql.NVarChar(50), orderCode)
      .input("status", sql.NVarChar(10), paymentStatus)
      .query(`
        UPDATE Payments
        SET status = @status
        WHERE transaction_id = @transaction_id
      `);

    console.log(`✅ Payment [${orderCode}] updated to ${paymentStatus}`);

    return res.redirect(
      `${process.env.FRONTEND_URL}/payment-result?status=${paymentStatus}&orderCode=${orderCode}`
    );
  } catch (err) {
    console.error("❌ Error in /payos/return:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
