/**
 * 📘 Payments API – Tích hợp thanh toán PayOS
 * ✅ Chuẩn Swagger (OpenAPI 3.0)
 */

const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: 💳 API quản lý thanh toán qua PayOS
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Payment:
 *       type: object
 *       properties:
 *         payment_id:
 *           type: integer
 *           example: 101
 *         subcription_id:
 *           type: integer
 *           example: 12
 *         user_id:
 *           type: integer
 *           example: 5
 *         voucher_id:
 *           type: integer
 *           nullable: true
 *           example: null
 *         original_amount:
 *           type: number
 *           example: 200000
 *         discount_amount:
 *           type: number
 *           example: 50000
 *         final_amount:
 *           type: number
 *           example: 150000
 *         currency:
 *           type: string
 *           example: "VND"
 *         payment_method:
 *           type: string
 *           example: "PayOS"
 *         description:
 *           type: string
 *           example: "Payment for subscription package"
 *         status:
 *           type: string
 *           example: "pending"
 *         transaction_id:
 *           type: string
 *           example: "1717698771234"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-07T09:45:00Z"
 *
 *     CreatePaymentRequest:
 *       type: object
 *       required:
 *         - subcription_id
 *         - original_amount
 *       properties:
 *         subcription_id:
 *           type: integer
 *           example: 1
 *         voucher_id:
 *           type: integer
 *           nullable: true
 *           example: 10
 *         original_amount:
 *           type: number
 *           example: 200000
 *         discount_amount:
 *           type: number
 *           example: 50000
 *         description:
 *           type: string
 *           example: "Thanh toán gói học 1 tháng"
 *         payment_method:
 *           type: string
 *           example: "PayOS"
 *
 *     PaymentResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ PayOS payment link created successfully"
 *         checkoutUrl:
 *           type: string
 *           example: "https://pay.payos.vn/checkout/xyz123"
 *         orderCode:
 *           type: string
 *           example: "1717698771234"
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error message"
 */

/**
 * @swagger
 * /api/payments/ping:
 *   get:
 *     summary: Kiểm tra API thanh toán hoạt động
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Payments API hoạt động bình thường
 *         content:
 *           text/plain:
 *             example: "✅ Payments API is working!"
 */
router.get("/ping", (req, res) => res.send("✅ Payments API is working!"));

// ⚙️ Khởi tạo PayOS client
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

/**
 * @swagger
 * /api/payments/payos/create:
 *   post:
 *     summary: Tạo liên kết thanh toán PayOS
 *     description: |
 *       Tạo một liên kết thanh toán cho gói đăng ký dựa trên `subscription_id` và số tiền.  
 *       - `user_id` sẽ được lấy tự động từ token người dùng.  
 *       - Hỗ trợ áp dụng voucher giảm giá.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       200:
 *         description: Liên kết thanh toán được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.post(
  "/payos/create",
  verifyToken,
  authorizeRoles("admin", "employee", "customer"),
  async (req, res) => {
    const user_id = req.user?.id;
    const { subcription_id, voucher_id, original_amount, discount_amount, description } = req.body;

    if (!user_id)
      return res.status(401).json({ message: "Unauthorized: missing user token" });

    if (!subcription_id || !original_amount)
      return res.status(400).json({ message: "Missing required fields: subcription_id, original_amount" });

    const final_amount = original_amount - (discount_amount || 0);
    if (final_amount <= 0)
      return res.status(400).json({ message: "Final amount must be greater than 0" });

    try {
      const pool = await poolPromise;

      // ✅ Kiểm tra user hợp lệ
      const checkUser = await pool
        .request()
        .input("user_id", sql.Int, user_id)
        .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");
      if (checkUser.recordset[0].count === 0)
        return res.status(400).json({ message: "Invalid user_id" });

      // ✅ Kiểm tra voucher hợp lệ
      if (voucher_id) {
        const checkVoucher = await pool
          .request()
          .input("voucher_id", sql.Int, voucher_id)
          .query("SELECT COUNT(*) AS count FROM Vouchers WHERE voucher_id = @voucher_id");
        if (checkVoucher.recordset[0].count === 0)
          return res.status(400).json({ message: "Invalid voucher_id" });
      }

      const orderCode = Date.now(); // Unique transaction ID

      // 🪙 Gọi API PayOS để tạo liên kết thanh toán
      const paymentLink = await payos.paymentRequests.create({
        orderCode,
        amount: final_amount,
        description: description,
        returnUrl: process.env.PAYOS_RETURN_URL,
        cancelUrl: process.env.PAYOS_CANCEL_URL,
      });

      // 💾 Lưu thông tin thanh toán vào DB
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
        .input("description", sql.NVarChar(100), description || null)
        .input("status", sql.NVarChar(10), "pending")
        .input("transaction_id", sql.NVarChar(50), orderCode.toString())
        .query(`
          INSERT INTO Payments (subcription_id, user_id, voucher_id, original_amount, discount_amount, final_amount, currency, payment_method, description, status, transaction_id, created_at)
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
 * @swagger
 * /api/payments/payos/return:
 *   get:
 *     summary: Nhận phản hồi từ PayOS sau khi thanh toán
 *     description: |
 *       Khi người dùng hoàn tất hoặc hủy thanh toán, PayOS sẽ gọi endpoint này để cập nhật trạng thái giao dịch.  
 *       Hệ thống sẽ cập nhật trạng thái trong bảng **Payments** và chuyển hướng người dùng về frontend.
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã giao dịch (transaction_id)
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           example: PAID
 *         description: Trạng thái thanh toán từ PayOS (PAID / CANCELLED / FAILED)
 *     responses:
 *       302:
 *         description: Chuyển hướng về trang kết quả thanh toán của frontend
 *       400:
 *         description: Thiếu orderCode hoặc dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/payos/return", async (req, res) => {
  try {
    const { orderCode, status } = req.query;

    if (!orderCode)
      return res.status(400).json({ message: "Missing orderCode" });

    const pool = await poolPromise;

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
