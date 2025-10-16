const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");
const { nanoid } = require('nanoid');
/**
 * @swagger
 * tags:
 *   name: Vouchers
 *   description: API quản lý mã giảm giá theo số tiền (VND)
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
 *           example: "A6XI3PZNAN"
 *         description:
 *           type: string
 *           example: "Voucher giảm 10,000 VND"
 *         discount_value:
 *           type: number
 *           description: "Số tiền giảm trực tiếp (VND)"
 *           example: 10000
 *         max_usage:
 *           type: integer
 *           example: 50
 *         used_count:
 *           type: integer
 *           example: 3
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-12-31T23:59:59Z"
 *         created_by:
 *           type: integer
 *           example: 2
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-15T08:00:00Z"
 *     CreateVoucherRequest:
 *       type: object
 *       required:
 *         - description
 *         - discount_value
 *         - max_usage
 *         - start_date
 *         - end_date
 *       properties:
 *         description:
 *           type: string
 *           example: "Voucher giảm 10,000 VND cho đơn hàng trên 100,000 VND"
 *         discount_value:
 *           type: number
 *           description: "Số tiền giảm trực tiếp (VND)"
 *           example: 10000
 *         max_usage:
 *           type: integer
 *           example: 50
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-12-31T23:59:59Z"
 */


/**
 * @swagger
 * /api/vouchers:
 *   get:
 *     summary: Lấy danh sách tất cả voucher
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách voucher hiện có
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Voucher'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */


router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM Vouchers ORDER BY created_at DESC");
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Error in GET /vouchers:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/vouchers/check/{code}:
 *   get:
 *     summary: Kiểm tra tính hợp lệ của voucher theo mã code
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã voucher cần kiểm tra
 *     responses:
 *       200:
 *         description: Voucher hợp lệ và có thể sử dụng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Voucher'
 *       400:
 *         description: Voucher hết hạn hoặc vượt giới hạn sử dụng
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/check/:code", verifyToken, async (req, res) => {
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
            return res.status(400).json({ message: "Voucher has reached its usage limit" });
        }
        if (now < new Date(voucher.start_date) || now > new Date(voucher.end_date)) {
            return res.status(400).json({ message: "Voucher is expired or not yet active" });
        }

        res.json(voucher);
    } catch (err) {
        console.error("❌ Error in GET /vouchers/check/:code:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/vouchers/create:
 *   post:
 *     summary: Tạo voucher mới (chỉ dành cho admin hoặc employee)
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
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 message: "✅ Voucher created successfully"
 *                 code: "A6XI3PZNAN"
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */


router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { description, discount_value, max_usage, start_date, end_date } = req.body;

    if (!description || discount_value === undefined || !max_usage || !start_date || !end_date) {
        return res.status(400).json({ message: "Missing required fields." });
    }
    if (new Date(start_date) >= new Date(end_date)) {
        return res.status(400).json({ message: "End date must be after start date." });
    }

    try {
        const pool = await poolPromise;
        let uniqueCode;
        let isCodeUnique = false;
        do {
            uniqueCode = nanoid(10).toUpperCase();
            const checkCode = await pool.request().input("code", sql.VarChar(20), uniqueCode).query("SELECT COUNT(*) AS count FROM Vouchers WHERE code = @code");
            if (checkCode.recordset[0].count === 0) {
                isCodeUnique = true;
            }
        } while (!isCodeUnique);

        await pool.request()
            .input("code", sql.VarChar(20), uniqueCode)
            .input("description", sql.NVarChar(100), description)
            .input("discount_value", sql.Decimal(10, 0), discount_value)
            .input("max_usage", sql.Int, max_usage)
            .input("start_date", sql.DateTime, start_date)
            .input("end_date", sql.DateTime, end_date)
            .input("created_by", sql.Int, req.user.id)
            .query(`
                INSERT INTO Vouchers (code, description, discount_value, max_usage, start_date, end_date, created_by)
                VALUES (@code, @description, @discount_value, @max_usage, @start_date, @end_date, @created_by)
            `);

        res.status(201).json({
            message: "✅ Voucher created successfully",
            code: uniqueCode
        });
    } catch (err) {
        console.error("❌ Error in POST /vouchers/create:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/vouchers/{id}:
 *   put:
 *     summary: Cập nhật thông tin voucher (admin, employee)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Voucher'
 *     responses:
 *       200:
 *         description: Cập nhật voucher thành công
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 message: "✅ Voucher updated successfully."
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "No fields to update provided." });
    }

    try {
        const pool = await poolPromise;
        const { description, discount_value, max_usage, start_date, end_date } = req.body;
        
        const setClauses = [];
        const request = pool.request().input('voucher_id', sql.Int, req.params.id);

        if (description !== undefined) { setClauses.push("description = @description"); request.input("description", sql.NVarChar(100), description); }
        if (discount_value !== undefined) { setClauses.push("discount_value = @discount_value"); request.input("discount_value", sql.Decimal(10, 0), discount_value); }
        if (max_usage !== undefined) { setClauses.push("max_usage = @max_usage"); request.input("max_usage", sql.Int, max_usage); }
        if (start_date !== undefined) { setClauses.push("start_date = @start_date"); request.input("start_date", sql.DateTime, start_date); }
        if (end_date !== undefined) { setClauses.push("end_date = @end_date"); request.input("end_date", sql.DateTime, end_date); }

        if (setClauses.length === 0) {
            return res.status(400).json({ message: "No valid fields to update." });
        }

        const query = `UPDATE Vouchers SET ${setClauses.join(", ")} WHERE voucher_id = @voucher_id`;
        const result = await request.query(query);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Voucher not found." });
        }

        res.json({ message: "✅ Voucher updated successfully." });
    } catch (err) {
        console.error("❌ Error in PUT /vouchers/:id:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/vouchers/{id}:
 *   delete:
 *     summary: Xóa voucher (admin, employee)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa voucher thành công
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 message: "✅ Voucher deleted successfully."
 *       404:
 *         description: Không tìm thấy voucher
 *       500:
 *         description: Lỗi máy chủ
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('voucher_id', sql.Int, req.params.id)
            .query("DELETE FROM Vouchers WHERE voucher_id = @voucher_id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Voucher not found." });
        }

        res.json({ message: "✅ Voucher deleted successfully." });
    } catch (err) {
        console.error("❌ Error in DELETE /vouchers/:id:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;