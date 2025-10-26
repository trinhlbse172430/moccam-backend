const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");


/**
 * @swagger
 * tags:
 *   name: Courses
 *   description: API quản lý khóa học trong hệ thống
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Course:
 *       type: object
 *       properties:
 *         course_id:
 *           type: integer
 *           example: 1
 *         course_name:
 *           type: string
 *           example: "Đàn Tranh Cơ Bản"
 *         description:
 *           type: string
 *           example: "Khóa học nhập môn dành cho người mới bắt đầu học đàn Tranh."
 *         level:
 *           type: string
 *           example: "Beginner"
 *         created_by:
 *           type: integer
 *           example: 5
 *         is_free:
 *           type: boolean
 *           example: false
 *         created_at:
 *           type: string
 *           example: "2025-10-07T10:30:00Z"
 *     CreateCourse:
 *       type: object
 *       required:
 *         - course_name
 *         - level
 *         - created_by
 *       properties:
 *         course_name:
 *           type: string
 *           example: "Học Đàn Tranh Nâng Cao"
 *         description:
 *           type: string
 *           example: "Dành cho học viên đã có kiến thức cơ bản."
 *         level:
 *           type: string
 *           example: "Advanced"
 *         created_by:
 *           type: integer
 *           example: 3
 *         is_free:
 *           type: boolean
 *           example: true
 */

/**
 * @swagger
 * /api/courses/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [Courses]
 *     responses:
 *       200:
 *         description: Courses API is working
 */
// ✅ Test route
router.get("/ping", (req, res) => {
    res.send("Courses API is working!");
});

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Lấy danh sách tất cả khóa học
 *     tags: [Courses]
 *     responses:
 *       200:
 *         description: Danh sách khóa học được trả về
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Course'
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 Lấy tất cả khóa học
 * GET /api/courses
 */
router.get("/", async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM Courses");
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Error in GET /courses:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của một khóa học theo ID
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của khóa học cần xem
 *     responses:
 *       200:
 *         description: Thông tin chi tiết của khóa học
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       404:
 *         description: Không tìm thấy khóa học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 Lấy khóa học theo ID
 * GET /api/courses/:id
 */
router.get("/:id", async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .query("SELECT * FROM Courses WHERE course_id = @course_id");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("❌ Error in GET /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * @swagger
 * /api/courses/create:
 *   post:
 *     summary: Thêm mới một khóa học (Admin hoặc Employee)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCourse'
 *     responses:
 *       201:
 *         description: Tạo khóa học thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Course added successfully"
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 Thêm khóa học mới
 * POST /api/courses
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const created_by = req.user.id; 
    const { course_name, description, level, is_free } = req.body;

    // Cập nhật validation (không cần created_by nữa)
    if (!course_name || !level ) {
        return res.status(400).json({ message: "Missing required fields: course_name, level" });
    }

    try {
        const pool = await poolPromise;
        
        // Xử lý is_free: nếu không gửi thì mặc định là 0 (false)
        const isFreeBit = (is_free === true || is_free === 1) ? 1 : 0;

        await pool.request()
            .input("course_name", sql.NVarChar(100), course_name)
            .input("description", sql.NVarChar(200), description || null)
            .input("level", sql.VarChar(20), level)
            .input("is_free", sql.Bit, isFreeBit) // Dùng biến đã xử lý
            .input("created_by", sql.Int, created_by) // Dùng created_by lấy từ token
            .query(`
                INSERT INTO Courses (course_name, description, level, created_by, is_free, created_at)
                VALUES (@course_name, @description, @level, @created_by, @is_free, GETDATE())
            `);

        res.status(201).json({ message: "✅ Course added successfully" });
    } catch (err) {
        console.error("❌ Error in POST /courses:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   put:
 *     summary: Cập nhật thông tin khóa học (Admin hoặc Employee)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của khóa học cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCourse'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Course updated successfully"
 *       404:
 *         description: Không tìm thấy khóa học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 Cập nhật khóa học
 * PUT /api/courses/:id
 */

router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { course_name, description, level, created_by, is_free } = req.body;

    if (!course_name || !level || typeof created_by === "undefined") {
        return res.status(400).json({ message: "Missing required fields: course_name, level, created_by" });
    }

    try {
        const pool = await poolPromise;
        const is_free = (is_free === undefined || is_free === null) ? 0 : (is_free ? 1 : 0);
        const checkCourse = await pool.request()
            .input("created_by", sql.Int, created_by)
            .query("SELECT COUNT(*) AS count FROM Courses WHERE created_by = @created_by");
        if (checkCourse.recordset[0].count === 0) {
            return res.status(400).json({ message: "Invalid created_by: employee not found" });
        }
        await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .input("course_name", sql.NVarChar(100), course_name)
            .input("description", sql.NVarChar(200), description || null)
            .input("level", sql.VarChar(20), level || 0)
            .input("is_free", sql.Bit, is_free)
            .input("created_by", sql.Int, created_by)
            .query(`
                UPDATE Courses
                SET course_name = @course_name,
                    description = @description,
                    level = @level,
                    is_free = @is_free
                    created_by = @created_by
                WHERE course_id = @course_id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json({ message: "✅ Course updated successfully" });
    } catch (err) {
        console.error("❌ Error in PUT /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   delete:
 *     summary: Xóa khóa học (Admin hoặc Employee)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của khóa học cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Course deleted successfully"
 *       404:
 *         description: Không tìm thấy khóa học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 Xóa khóa học
 * DELETE /api/courses/:id
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .query("DELETE FROM Courses WHERE course_id = @course_id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json({ message: "✅ Course deleted successfully" });
    } catch (err) {
        console.error("❌ Error in DELETE /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

module.exports = router;
