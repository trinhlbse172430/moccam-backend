const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ⚙️ Khởi tạo PayOS client
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

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
 *           example: 1
 *         user_id:
 *           type: integer
 *           example: 12
 *         plan_id:
 *           type: integer
 *           example: 3
 *         voucher_id:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         original_amount:
 *           type: number
 *           example: 299000
 *         discount_amount:
 *           type: number
 *           example: 50000
 *         final_amount:
 *           type: number
 *           example: 249000
 *         payment_method:
 *           type: string
 *           example: "PayOS"
 *         status:
 *           type: string
 *           example: "pending"
 *         transaction_id:
 *           type: string
 *           example: "1731419053267"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T14:20:00Z"
 */

/* ===========================================================
   🟢 POST /api/payments/payos/create
   → Tạo giao dịch thanh toán PayOS
=========================================================== */
/**
 * @swagger
 * /api/payments/payos/create:
 *   post:
 *     summary: 💰 Tạo giao dịch thanh toán qua PayOS
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
 *               - plan_id
 *             properties:
 *               plan_id:
 *                 type: integer
 *                 example: 2
 *               voucher_id:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       200:
 *         description: ✅ Tạo link thanh toán thành công
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
 *                   example: "https://pay.payos.vn/checkout/abcdef"
 *                 orderCode:
 *                   type: string
 *                   example: "1731419053267"
 *       400:
 *         description: Thiếu thông tin hoặc voucher không hợp lệ
 *       404:
 *         description: Không tìm thấy gói học
 *       500:
 *         description: Lỗi máy chủ
 */
// File: routes/payments.js

router.post("/payos/create", verifyToken, authorizeRoles("customer"), async (req, res) => {
    const user_id = req.user.id;
    const { plan_id, voucher_id } = req.body;

    if (!plan_id) {
        return res.status(400).json({ message: "Missing required field: plan_id" });
    }

    try {
        const pool = await poolPromise;

        // 1. Lấy thông tin gói và voucher
        const planResult = await pool.request().input("plan_id", sql.Int, plan_id).query("SELECT plan_name, price FROM SubscriptionPlans WHERE plan_id = @plan_id AND is_active = 1");
        if (planResult.recordset.length === 0) {
            return res.status(404).json({ message: "Subscription plan not found or is not active." });
        }

        const plan = planResult.recordset[0];
        let original_amount = plan.price;
        let discount_amount = 0;

        if (voucher_id) {
            const voucherResult = await pool.request().input("voucher_id", sql.Int, voucher_id).query("SELECT discount_value, used_count, max_usage FROM Vouchers WHERE voucher_id = @voucher_id AND GETDATE() BETWEEN start_date AND end_date");
            if (voucherResult.recordset.length > 0) {
                const voucher = voucherResult.recordset[0];
                if (voucher.used_count >= voucher.max_usage) {
                    return res.status(400).json({ message: "Voucher has reached its usage limit." });
                }
                discount_amount = voucher.discount_value;
            } else {
                return res.status(400).json({ message: "Voucher is not valid." });
            }
        }

        // 2. Tính toán và xác thực số tiền cuối cùng
        const final_amount = Math.max(0, original_amount - discount_amount);

        // 3. 💡 LOGIC MỚI: Xử lý trường hợp GÓI MIỄN PHÍ (0đ)
        if (final_amount === 0) {
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                // Ghi nhận thanh toán thành công ngay lập tức
                await transaction.request()
                    .input("user_id", sql.Int, user_id).input("plan_id", sql.Int, plan_id).input("voucher_id", sql.Int, voucher_id || null)
                    .input("original_amount", sql.Decimal(10, 2), original_amount).input("discount_amount", sql.Decimal(10, 2), discount_amount)
                    .input("final_amount", sql.Decimal(10, 2), 0)
                    .input("description", sql.NVarChar(255), `Kích hoạt miễn phí ${plan.plan_name}`)
                    .input("status", sql.NVarChar(20), "success") // Trạng thái SUCCESS
                    .input("payment_method", sql.NVarChar(50), "PayOS")
                    .input("transaction_id", sql.NVarChar(100), `FREE_${Date.now()}`)
                    .query(`INSERT INTO Payments (user_id, plan_id, voucher_id, original_amount, discount_amount, final_amount, description, status, transaction_id, payment_method) 
                    VALUES (@user_id, @plan_id, @voucher_id, @original_amount, @discount_amount, @final_amount, @description, @status, @transaction_id, @payment_method)`);

                // Cập nhật voucher
                if (voucher_id) {
                    await transaction.request().input("voucher_id", sql.Int, voucher_id).query(`UPDATE Vouchers SET used_count = used_count + 1 WHERE voucher_id = @voucher_id`);
                }

                // Kích hoạt subscription
                const subResult = await transaction.request().input("plan_id", sql.Int, plan_id).query("SELECT duration_in_days FROM SubscriptionPlans WHERE plan_id = @plan_id");
                const duration = subResult.recordset[0].duration_in_days;
                await transaction.request().input("user_id", sql.Int, user_id).input("plan_id", sql.Int, plan_id)
                    .query(`INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, status) VALUES (@user_id, @plan_id, GETDATE(), DATEADD(day, ${duration}, GETDATE()), 'active')`);
                
                await transaction.commit();

                return res.status(200).json({ message: "✅ Voucher applied. Your plan has been activated for free!" });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        }

        // 4. LOGIC CŨ (cho các gói có trả phí > 0) - ĐÃ ĐỔI THỨ TỰ
        const orderCode = Date.now();
        const descriptionForPayOS = `Thanh toán ${plan.plan_name}`.substring(0, 25);
        
        // BƯỚC 4.1: TẠO LINK PAYOS TRƯỚC
        const paymentLink = await payos.paymentRequests.create({
            orderCode,
            amount: final_amount,
            description: descriptionForPayOS,
            returnUrl: process.env.PAYOS_RETURN_URL,
            cancelUrl: process.env.PAYOS_CANCEL_URL,
        });

        // BƯỚC 4.2: CHỈ KHI TẠO LINK THÀNH CÔNG MỚI LƯU VÀO DB
        await pool.request()
            .input("user_id", sql.Int, user_id).input("plan_id", sql.Int, plan_id).input("voucher_id", sql.Int, voucher_id || null)
            .input("original_amount", sql.Decimal(10, 2), original_amount).input("discount_amount", sql.Decimal(10, 2), discount_amount)
            .input("final_amount", sql.Decimal(10, 2), final_amount)
            .input("description", sql.NVarChar(255), descriptionForPayOS)
            .input("status", sql.NVarChar(20), "pending")
             .input("payment_method", sql.NVarChar(50), "PayOS")
            .input("transaction_id", sql.NVarChar(100), orderCode.toString())
            .query(`INSERT INTO Payments (user_id, plan_id, voucher_id, original_amount, discount_amount, final_amount, description, status, transaction_id, payment_method) VALUES (@user_id, @plan_id, @voucher_id, @original_amount, @discount_amount, @final_amount, @description, @status, @transaction_id, @payment_method)`);

        res.json({
            message: "✅ PayOS payment link created successfully",
            checkoutUrl: paymentLink.checkoutUrl,
            orderCode,
        });

    } catch (err) {
        console.error("❌ Error in /payos/create:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/* ===========================================================
   🔁 GET /api/payments/payos/return
   → Nhận callback từ PayOS sau khi thanh toán
=========================================================== */
/**
 * @swagger
 * /api/payments/payos/return:
 *   get:
 *     summary: 🔁 Callback kết quả thanh toán từ PayOS
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PAID, CANCELLED, FAILED]
 *     responses:
 *       302:
 *         description: Redirect về trang kết quả của frontend
 */
router.get("/payos/return", async (req, res) => {
  try {
    const { orderCode, status } = req.query;
    if (!orderCode) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-result?status=error&message=MissingOrderCode`);
    }

    const normalizedStatus = status?.toUpperCase();
    let paymentStatus = normalizedStatus === "PAID" ? "success" : normalizedStatus === "CANCELLED" ? "cancelled" : "failed";

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input("transaction_id", sql.NVarChar(100), orderCode)
        .input("status", sql.NVarChar(20), paymentStatus)
        .query(`UPDATE Payments SET status = @status WHERE transaction_id = @transaction_id`);

      if (paymentStatus === "success") {
        const paymentResult = await transaction.request()
          .input("transaction_id", sql.NVarChar(100), orderCode)
          .query("SELECT user_id, plan_id, voucher_id FROM Payments WHERE transaction_id = @transaction_id");

        if (paymentResult.recordset.length === 0) throw new Error(`Payment not found: ${orderCode}`);
        const { user_id, plan_id, voucher_id } = paymentResult.recordset[0];

        if (voucher_id) {
          await transaction.request().input("voucher_id", sql.Int, voucher_id)
            .query("UPDATE Vouchers SET used_count = used_count + 1 WHERE voucher_id = @voucher_id");
        }

        const subResult = await transaction.request().input("plan_id", sql.Int, plan_id)
          .query("SELECT duration_in_days FROM SubscriptionPlans WHERE plan_id = @plan_id");

        const duration = subResult.recordset[0]?.duration_in_days || 30;
        await transaction.request()
          .input("user_id", sql.Int, user_id)
          .input("plan_id", sql.Int, plan_id)
          .query(`INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, status)
                  VALUES (@user_id, @plan_id, GETDATE(), DATEADD(day, ${duration}, GETDATE()), 'active')`);
      }

      await transaction.commit();
      return res.redirect(`${process.env.FRONTEND_URL}/payment-result?status=${paymentStatus}&orderCode=${orderCode}`);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("❌ Error in /payos/return:", err.message);
    return res.redirect(`${process.env.FRONTEND_URL}/payment-result?status=error&message=ServerError`);
  }
});

/* ===========================================================
   🧾 GET /api/payments
   → Xem danh sách thanh toán (theo quyền)
=========================================================== */
/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: 🧾 Lấy danh sách lịch sử thanh toán
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách thanh toán được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    let query = `
      SELECT p.*, u.full_name AS user_name, sp.plan_name
      FROM Payments p
      JOIN Users u ON p.user_id = u.user_id
      LEFT JOIN SubscriptionPlans sp ON p.plan_id = sp.plan_id
    `;
    const request = pool.request();

    if (req.user.role === "customer") {
      query += " WHERE p.user_id = @user_id";
      request.input("user_id", sql.Int, req.user.id);
    }

    query += " ORDER BY p.created_at DESC";
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /payments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
