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
router.post("/payos/create",verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
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

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Lấy danh sách tất cả thanh toán (admin, employee) hoặc của chính người dùng
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách thanh toán trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    let query = `
      SELECT p.*, u.full_name AS user_name, s.subcription_name
      FROM Payments p
      JOIN Users u ON p.user_id = u.user_id
      JOIN Subscriptions s ON p.subcription_id = s.subcription_id
    `;

    // Nếu là customer → chỉ hiển thị giao dịch của chính mình
    if (req.user.role === "customer") {
      query += ` WHERE p.user_id = ${req.user.id}`;
    }

    query += " ORDER BY p.created_at DESC";

    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /payments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của một thanh toán
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của thanh toán cần xem chi tiết
 *     responses:
 *       200:
 *         description: Thông tin chi tiết thanh toán trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc không có quyền
 *       404:
 *         description: Không tìm thấy thanh toán
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .query(`
        SELECT p.*, u.full_name AS user_name, s.subcription_name
        FROM Payments p
        JOIN Users u ON p.user_id = u.user_id
        JOIN Subscriptions s ON p.subcription_id = s.subcription_id
        WHERE p.payment_id = @payment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = result.recordset[0];

    // Nếu là customer → chỉ được xem payment của chính mình
    if (req.user.role === "customer" && payment.user_id !== req.user.id) {
      return res.status(403).json({ message: "Forbidden: You can only view your own payments" });
    }

    res.json(payment);
  } catch (err) {
    console.error("❌ Error in GET /payments/:id:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
