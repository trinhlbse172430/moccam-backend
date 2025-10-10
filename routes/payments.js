const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: API quản lý thanh toán PayOS
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
 */

/**
 * @swagger
 * /api/payments/ping:
 *   get:
 *     summary: Kiểm tra API thanh toán hoạt động
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Payments API is working
 */

// ✅ Kiểm tra hoạt động
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
 *     description: Tạo một liên kết thanh toán cho người dùng dựa trên subscription, voucher và số tiền.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subcription_id
 *               - user_id
 *               - original_amount
 *             properties:
 *               subcription_id:
 *                 type: integer
 *                 example: 1
 *               user_id:
 *                 type: integer
 *                 example: 5
 *               voucher_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 10
 *               original_amount:
 *                 type: number
 *                 example: 200000
 *               discount_amount:
 *                 type: number
 *                 example: 50000
 *               description:
 *                 type: string
 *                 example: "Payment for monthly plan"
 *     responses:
 *       200:
 *         description: Liên kết thanh toán được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ PayOS payment link created successfully"
 *                 checkoutUrl:
 *                   type: string
 *                   example: "https://pay.payos.vn/checkout/xyz123"
 *                 orderCode:
 *                   type: string
 *                   example: "1717698771234"
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */

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
 * @swagger
 * /api/payments/payos/return:
 *   get:
 *     summary: Cập nhật trạng thái thanh toán khi PayOS gọi lại (return URL)
 *     description: Endpoint này được gọi khi người dùng hoàn tất (hoặc hủy) thanh toán. Hệ thống sẽ cập nhật trạng thái trong cơ sở dữ liệu.
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
 *         description: Chuyển hướng về giao diện frontend với kết quả thanh toán
 *       400:
 *         description: Thiếu orderCode hoặc dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */

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
