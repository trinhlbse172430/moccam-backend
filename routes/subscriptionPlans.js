const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: SubscriptionPlans
 *   description: 💎 API quản lý gói đăng ký học (Subscription Plans)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SubscriptionPlan:
 *       type: object
 *       properties:
 *         plan_id:
 *           type: integer
 *           example: 1
 *         plan_name:
 *           type: string
 *           example: "Gói học 3 tháng"
 *         description:
 *           type: string
 *           example: "Truy cập toàn bộ khóa học trong 90 ngày"
 *         price:
 *           type: number
 *           example: 299000
 *         currency:
 *           type: string
 *           example: "VND"
 *         duration_in_days:
 *           type: integer
 *           example: 90
 *         is_active:
 *           type: boolean
 *           example: true
 */

/* ===========================================================
   🟢 GET /api/subscription-plans
   → Lấy danh sách toàn bộ gói đăng ký
=========================================================== */
/**
 * @swagger
 * /api/subscription-plans:
 *   get:
 *     summary: 📋 Lấy danh sách tất cả gói đăng ký học
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách gói đăng ký trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SubscriptionPlan'
 *       401:
 *         description: Token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    let query = "SELECT * FROM SubscriptionPlans";

    if (req.user.role === "customer") {
      query += " WHERE is_active = 1";
    }

    query += " ORDER BY price ASC";
    const result = await pool.request().query(query);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /subscription-plans:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================================================
   🟢 GET /api/subscription-plans/:id
   → Lấy chi tiết gói đăng ký
=========================================================== */
/**
 * @swagger
 * /api/subscription-plans/{id}:
 *   get:
 *     summary: 🔍 Xem chi tiết một gói đăng ký
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của gói đăng ký
 *     responses:
 *       200:
 *         description: Thông tin chi tiết gói đăng ký
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionPlan'
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("plan_id", sql.Int, req.params.id)
      .query("SELECT * FROM SubscriptionPlans WHERE plan_id = @plan_id");

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Subscription plan not found." });

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /subscription-plans/:id:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================================================
   🟡 POST /api/subscription-plans/create
   → Tạo mới gói đăng ký (Admin/Employee)
=========================================================== */
/**
 * @swagger
 * /api/subscription-plans/create:
 *   post:
 *     summary: ➕ Tạo mới gói đăng ký học
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_name
 *               - price
 *               - duration_in_days
 *             properties:
 *               plan_name:
 *                 type: string
 *                 example: "Gói học 6 tháng"
 *               description:
 *                 type: string
 *                 example: "Bao gồm tất cả khóa học, không giới hạn"
 *               price:
 *                 type: number
 *                 example: 499000
 *               duration_in_days:
 *                 type: integer
 *                 example: 180
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: ✅ Gói đăng ký được tạo thành công
 *       400:
 *         description: Thiếu thông tin bắt buộc
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { plan_name, description, price, duration_in_days, is_active = true } = req.body;

  if (!plan_name || !price || !duration_in_days) {
    return res
      .status(400)
      .json({ message: "Missing required fields: plan_name, price, duration_in_days." });
  }

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("plan_name", sql.NVarChar(50), plan_name)
      .input("description", sql.NVarChar(255), description)
      .input("price", sql.Decimal(10, 0), price)
      .input("currency", sql.VarChar(3), "VND")
      .input("duration_in_days", sql.Int, duration_in_days)
      .input("is_active", sql.Bit, is_active)
      .query(`
        INSERT INTO SubscriptionPlans (plan_name, description, price, duration_in_days, is_active)
        OUTPUT INSERTED.*
        VALUES (@plan_name, @description, @price, @duration_in_days, @is_active)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in POST /subscription-plans:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================================================
   🟠 PUT /api/subscription-plans/:id
   → Cập nhật thông tin gói đăng ký
=========================================================== */
/**
 * @swagger
 * /api/subscription-plans/{id}:
 *   put:
 *     summary: 🛠️ Cập nhật thông tin gói đăng ký học
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của gói đăng ký
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_name:
 *                 type: string
 *                 example: "Gói học 12 tháng (VIP)"
 *               description:
 *                 type: string
 *                 example: "Gói học cao cấp cho thành viên thân thiết"
 *               price:
 *                 type: number
 *                 example: 899000
 *               duration_in_days:
 *                 type: integer
 *                 example: 365
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: ✅ Cập nhật thành công
 *       400:
 *         description: Thiếu hoặc sai dữ liệu
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ message: "No fields to update provided." });

  try {
    const pool = await poolPromise;
    const { plan_name, description, price, duration_in_days, is_active } = req.body;

    const setClauses = [];
    const request = pool.request().input("plan_id", sql.Int, req.params.id);

    if (plan_name !== undefined) {
      setClauses.push("plan_name = @plan_name");
      request.input("plan_name", sql.NVarChar(50), plan_name);
    }
    if (description !== undefined) {
      setClauses.push("description = @description");
      request.input("description", sql.NVarChar(255), description);
    }
    if (price !== undefined) {
      setClauses.push("price = @price");
      request.input("price", sql.Decimal(10, 2), price);
    }
    if (duration_in_days !== undefined) {
      setClauses.push("duration_in_days = @duration_in_days");
      request.input("duration_in_days", sql.Int, duration_in_days);
    }
    if (is_active !== undefined) {
      setClauses.push("is_active = @is_active");
      request.input("is_active", sql.Bit, is_active);
    }

    const query = `UPDATE SubscriptionPlans SET ${setClauses.join(", ")} WHERE plan_id = @plan_id`;
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0)
      return res.status(404).json({ message: "Subscription plan not found." });

    res.json({ message: "✅ Subscription plan updated successfully." });
  } catch (err) {
    console.error("❌ Error in PUT /subscription-plans/:id:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
