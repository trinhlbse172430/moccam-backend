const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/lessons/ping (Kiểm tra API)
router.get("/ping", (req, res) => {
    res.send("Lessons API is working!");
});

// GET /api/lessons (Lấy tất cả bài học)
// Thêm verifyToken để chỉ người dùng đã đăng nhập mới xem được
router.get("/", verifyToken, async (req, res) => {
    try {
        const sqlQuery = "SELECT * FROM Lessons ORDER BY created_at DESC"; // Sắp xếp theo ngày tạo mới nhất
        const [rows] = await pool.query(sqlQuery);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /lessons:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/lessons/:id (Lấy bài học theo ID)
// Thêm verifyToken
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const lessonId = req.params.id;
        const sqlQuery = "SELECT * FROM Lessons WHERE lesson_id = ?";
        const [rows] = await pool.query(sqlQuery, [lessonId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy bài học" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Lỗi GET /lessons/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/lessons/create (Tạo bài học mới - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { course_id, lesson_name, description, video_url, picture_url, is_free } = req.body;

    if (!course_id || !lesson_name) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: course_id, lesson_name" });
    }

    try {
        // Kiểm tra course_id có tồn tại không
        const [courseRows] = await pool.query("SELECT course_id FROM Courses WHERE course_id = ?", [course_id]);
        if (courseRows.length === 0) {
            return res.status(400).json({ message: "course_id không hợp lệ: Không tìm thấy khóa học" });
        }

        // Chuyển is_free thành 1 hoặc 0
        const isFreeBit = is_free ? 1 : 0;

        const sqlInsert = `
            INSERT INTO Lessons (course_id, lesson_name, description, video_url, picture_url, is_free, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        await pool.query(sqlInsert, [
            course_id, lesson_name, description || null, video_url || null, picture_url || null, isFreeBit
        ]);

        res.status(201).json({ message: "✅ Thêm bài học thành công" });
    } catch (err) {
        console.error("❌ Lỗi POST /lessons/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/lessons/:id (Cập nhật bài học - Admin/Employee)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const lessonId = req.params.id;
    const { course_id, lesson_name, description, video_url, picture_url, is_free } = req.body;

    // Tối thiểu cần có course_id và lesson_name khi cập nhật (hoặc bạn có thể bỏ tùy logic)
    if (!course_id || !lesson_name) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: course_id, lesson_name" });
    }
    if (Object.keys(req.body).length === 0) {
         return res.status(400).json({ message: "Không có trường nào để cập nhật" });
    }


    try {
        // Kiểm tra course_id có tồn tại không (nếu được gửi lên)
        if (course_id !== undefined) {
            const [courseRows] = await pool.query("SELECT course_id FROM Courses WHERE course_id = ?", [course_id]);
            if (courseRows.length === 0) {
                return res.status(400).json({ message: "course_id không hợp lệ: Không tìm thấy khóa học" });
            }
        }

        // Xây dựng câu lệnh UPDATE động
        const setClauses = [];
        const params = [];

        if (course_id !== undefined) { setClauses.push("course_id = ?"); params.push(course_id); }
        if (lesson_name !== undefined) { setClauses.push("lesson_name = ?"); params.push(lesson_name); }
        if (description !== undefined) { setClauses.push("description = ?"); params.push(description); }
        if (video_url !== undefined) { setClauses.push("video_url = ?"); params.push(video_url); }
        if (picture_url !== undefined) { setClauses.push("picture_url = ?"); params.push(picture_url); }
        if (is_free !== undefined) { setClauses.push("is_free = ?"); params.push(is_free ? 1 : 0); }

        if (setClauses.length === 0) {
             return res.status(400).json({ message: "Không có trường hợp lệ để cập nhật" });
        }


        params.push(lessonId); // Thêm lesson_id vào cuối cho WHERE

        const sqlUpdate = `UPDATE Lessons SET ${setClauses.join(", ")} WHERE lesson_id = ?`;
        const [result] = await pool.query(sqlUpdate, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy bài học" });
        }

        res.json({ message: "✅ Cập nhật bài học thành công" });
    } catch (err) {
        console.error("❌ Lỗi PUT /lessons/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/lessons/:id (Xóa bài học - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const lessonId = req.params.id;

        // (Quan trọng) Kiểm tra các bảng liên quan trước khi xóa
        const checks = [
            { table: "Resources", column: "lesson_id", message: "Có tài nguyên liên quan đến bài học này." },
            { table: "Hand_Motions", column: "lesson_id", message: "Có dữ liệu bài tập AI liên quan đến bài học này." },
            { table: "Comments", column: "lesson_id", message: "Có bình luận liên quan đến bài học này." },
            { table: "LessonProgress", column: "lesson_id", message: "Có dữ liệu tiến độ học của người dùng liên quan đến bài học này." },
        ];

        for (const check of checks) {
            const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${check.table} WHERE ${check.column} = ?`, [lessonId]);
            if (rows[0].count > 0) {
                return res.status(400).json({ message: "Không thể xóa bài học này.", reason: check.message });
            }
        }

        // Tiến hành xóa
        const [result] = await pool.query("DELETE FROM Lessons WHERE lesson_id = ?", [lessonId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy bài học" });
        }

        res.json({ message: "✅ Xóa bài học thành công" });
    } catch (err) {
        console.error("❌ Lỗi DELETE /lessons/:id:", err.message);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa bài học do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;