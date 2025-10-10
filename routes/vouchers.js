const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");


/**
 * @swagger
 * tags:
 *   name: Vouchers
 *   description: API quản lý voucher (mã giảm giá)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Voucher:
 *       type: object
 *       properties:
 *         voucher_id:
 *           type: integer
 *           example: 1
 *         code:
 *           type: string
 *           example: "SUMMER2025"
 *         description:
 *           type: string
 *           example: "Giảm 20% cho mùa hè"
 *         discount_type:
 *           type: string
 *           example: "percent"
 *         discount_value:
 *           type: integer
 *           example: 20
 *         max_usage:
 *           type: integer
 *           example: 100
 *         used_count:
 *           type: integer
 *           example: 10
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-05-01T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-08-01T00:00:00Z"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-04-01T09:00:00Z"
 *     CreateVoucherRequest:
 *       type: object
 *       required:
 *         - code
 *         - discount_type
 *         - discount_value
 *         - max_usage
 *         - start_date
 *         - end_date
 *       properties:
 *         code:
 *           type: string
 *           example: "WELCOME10"
 *         description:
 *           type: string
 *           example: "Giảm 10% cho khách hàng mới"
 *         discount_type:
 *           type: string
 *           example: "percent"
 *         discount_value:
 *           type: integer
 *           example: 10
 *         max_usage:
 *           type: integer
 *           example: 50
 *         start_date:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         end_date:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 */

/**
 * @swagger
 * /api/vouchers/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [Vouchers]
 *     responses:
 *       200:
 *         description: Vouchers API is working
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Vouchers API is working!");
});

/**
 * @swagger
 * /api/vouchers:
 *   get:
 *     summary: Lấy danh sách tất cả voucher
 *     tags: [Vouchers]
 *     responses:
 *       200:
 *         description: Danh sách voucher trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Voucher'
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/vouchers
 * Lấy toàn bộ danh sách voucher
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT * FROM Vouchers ORDER BY created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /vouchers:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/vouchers/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết voucher theo ID
 *     tags: [Vouchers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của voucher
 *     responses:
 *       200:
 *         description: Thông tin voucher
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Voucher'
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/vouchers/:id
 * Lấy voucher theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("voucher_id", sql.Int, req.params.id)
      .query("SELECT * FROM Vouchers WHERE voucher_id = @voucher_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /vouchers/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/vouchers/create:
 *   post:
 *     summary: Tạo mới một voucher (chỉ admin)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVoucherRequest'
 *     responses:
 *       201:
 *         description: Tạo voucher thành công
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 POST /api/vouchers
 * Tạo voucher mới
 * Required: code, discount_type, discount_value, start_date, end_date, max_usage
 */
router.post("/create", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    max_usage,
    start_date,
    end_date
  } = req.body;

  if (!code || !discount_type || !discount_value || !max_usage || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing required fields: code, discount_type, discount_value, max_usage, start_date, end_date" });
  }

  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ message: "End date must be after start date" });
  }

  if (!["percent", "fixed"].includes(discount_type.toLowerCase())) {
    return res.status(400).json({ message: "Invalid discount_type. Must be 'percent' or 'fixed'" });
  }

  try {
    const pool = await poolPromise;

    // Kiểm tra trùng code
    const checkCode = await pool.request()
      .input("code", sql.VarChar(20), code)
      .query("SELECT COUNT(*) AS count FROM Vouchers WHERE code = @code");

    if (checkCode.recordset[0].count > 0) {
      return res.status(400).json({ message: "Voucher code already exists" });
    }

    // ✅ Tạo mới voucher
    await pool.request()
      .input("code", sql.VarChar(20), code)
      .input("description", sql.NVarChar(100), description || null)
      .input("discount_type", sql.VarChar(10), discount_type)
      .input("discount_value", sql.Int, discount_value)
      .input("max_usage", sql.Int, max_usage)
      .input("start_date", sql.DateTime, start_date)
      .input("end_date", sql.DateTime, end_date)
      .query(`
        INSERT INTO Vouchers (code, description, discount_type, discount_value, max_usage, start_date, end_date, created_at)
        VALUES (@code, @description, @discount_type, @discount_value, @max_usage, @start_date, @end_date, GETDATE())
      `);

    res.status(201).json({ message: "✅ Voucher created successfully" });
  } catch (err) {
    console.error("❌ Error in POST /vouchers:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/vouchers/{id}:
 *   put:
 *     summary: Cập nhật thông tin voucher (chỉ admin)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của voucher
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVoucherRequest'
 *     responses:
 *       200:
 *         description: Cập nhật voucher thành công
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/vouchers/:id
 * Cập nhật voucher
 */
router.put("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    max_usage,
    start_date,
    end_date,
    used_count
  } = req.body;

  if (!code || !discount_type || !discount_value || !max_usage || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ message: "End date must be after start date" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("voucher_id", sql.Int, req.params.id)
      .input("code", sql.VarChar(20), code)
      .input("description", sql.NVarChar(100), description || null)
      .input("discount_type", sql.VarChar(10), discount_type)
      .input("discount_value", sql.Int, discount_value)
      .input("max_usage", sql.Int, max_usage)
      .input("used_count", sql.Int, used_count ?? 0)
      .input("start_date", sql.DateTime, start_date)
      .input("end_date", sql.DateTime, end_date)
      .query(`
        UPDATE Vouchers
        SET code = @code,
            description = @description,
            discount_type = @discount_type,
            discount_value = @discount_value,
            max_usage = @max_usage,
            used_count = @used_count,
            start_date = @start_date,
            end_date = @end_date
        WHERE voucher_id = @voucher_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    res.json({ message: "✅ Voucher updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /vouchers/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/vouchers/use/{code}:
 *   put:
 *     summary: Áp dụng voucher bằng mã code (tăng lượt dùng)
 *     tags: [Vouchers]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã voucher cần áp dụng
 *     responses:
 *       200:
 *         description: Áp dụng voucher thành công
 *       400:
 *         description: Voucher hết hạn hoặc vượt giới hạn
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/vouchers/use/:code
 * Áp dụng 1 voucher — tăng used_count nếu hợp lệ
 */
router.put("/use/:code", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("code", sql.VarChar(20), req.params.code)
      .query("SELECT * FROM Vouchers WHERE code = @code");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    const voucher = result.recordset[0];
    const now = new Date();

    if (voucher.used_count >= voucher.max_usage) {
      return res.status(400).json({ message: "Voucher usage limit reached" });
    }

    if (now < new Date(voucher.start_date) || now > new Date(voucher.end_date)) {
      return res.status(400).json({ message: "Voucher is expired or not yet active" });
    }

    // ✅ Cập nhật số lần sử dụng
    await pool.request()
      .input("code", sql.VarChar(20), req.params.code)
      .query("UPDATE Vouchers SET used_count = used_count + 1 WHERE code = @code");

    res.json({ message: "✅ Voucher applied successfully", voucher });
  } catch (err) {
    console.error("❌ Error in PUT /vouchers/use/:code:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/vouchers/{id}:
 *   delete:
 *     summary: Xóa voucher (chỉ admin)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của voucher cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/vouchers/:id
 * Xóa voucher
 */
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("voucher_id", sql.Int, req.params.id)
      .query("DELETE FROM Vouchers WHERE voucher_id = @voucher_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    res.json({ message: "✅ Voucher deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /vouchers/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
