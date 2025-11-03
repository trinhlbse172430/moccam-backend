const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/courses/ping (Kiểm tra API)
router.get("/ping", (req, res) => {
    res.send("Courses API is working!");
});

router.get("/", async (req, res) => {
    try {
        const sqlQuery = "SELECT * FROM Courses ORDER BY created_at DESC";
        const [rows] = await pool.query(sqlQuery);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /courses:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/courses/:id (Lấy khóa học theo ID - CÔNG KHAI)
router.get("/:id", async (req, res) => {
    try {
        const courseId = req.params.id;
        const sqlQuery = "SELECT * FROM Courses WHERE course_id = ?";
        const [rows] = await pool.query(sqlQuery, [courseId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy khóa học" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Lỗi GET /courses/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/courses/create (Tạo khóa học mới - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const created_by = req.user.id; // Lấy từ token
    const { course_name, description, level, is_free } = req.body;

    if (!course_name || !level) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: course_name, level" });
    }

    try {
        // Xử lý is_free: nếu không gửi hoặc false thì là 0, true/1 là 1
        const isFreeBit = (is_free === true || is_free === 1) ? 1 : 0;

        const sqlInsert = `
            INSERT INTO Courses (course_name, description, level, created_by, is_free, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        const [result] = await pool.query(sqlInsert, [
            course_name, description || null, level, created_by, isFreeBit
        ]);

        // Lấy lại khóa học vừa tạo để trả về (tùy chọn)
        const [newCourseRows] = await pool.query("SELECT * FROM Courses WHERE course_id = ?", [result.insertId]);

        res.status(201).json({ message: "✅ Thêm khóa học thành công", course: newCourseRows[0] });
    } catch (err) {
        console.error("❌ Lỗi POST /courses/create:", err.message);
        // Bắt lỗi trùng tên khóa học nếu có UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ message: "Tên khóa học đã tồn tại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/courses/:id (Cập nhật khóa học - Admin/Employee)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const courseId = req.params.id;
    // Lấy created_by từ token để đảm bảo chỉ người tạo (hoặc admin cấp cao hơn) mới sửa? - Tùy logic
    // const currentUserId = req.user.id;
    const { course_name, description, level, is_free } = req.body;

    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Không có trường nào để cập nhật." });
    }

    try {
        const setClauses = [];
        const params = [];

        // Xây dựng câu lệnh SET động
        if (course_name !== undefined) { setClauses.push("course_name = ?"); params.push(course_name); }
        if (description !== undefined) { setClauses.push("description = ?"); params.push(description); }
        if (level !== undefined) { setClauses.push("level = ?"); params.push(level); }
        if (is_free !== undefined) { setClauses.push("is_free = ?"); params.push(is_free ? 1 : 0); }
        // Lưu ý: Không nên cho phép cập nhật created_by

        if (setClauses.length === 0) {
            return res.status(400).json({ message: "Không có trường hợp lệ để cập nhật." });
        }

        params.push(courseId); // Thêm course_id vào cuối cho WHERE

        const sqlUpdate = `UPDATE Courses SET ${setClauses.join(", ")} WHERE course_id = ?`;
        const [result] = await pool.query(sqlUpdate, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy khóa học." });
        }

        res.json({ message: "✅ Cập nhật khóa học thành công." });
    } catch (err) {
        console.error("❌ Lỗi PUT /courses/:id:", err.message);
         // Bắt lỗi trùng tên khóa học nếu có UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ message: "Tên khóa học đã tồn tại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/courses/:id (Xóa khóa học - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const courseId = req.params.id;

        // (Quan trọng) Kiểm tra xem có Lessons nào thuộc khóa học này không
        const [lessonRows] = await pool.query("SELECT COUNT(*) AS count FROM Lessons WHERE course_id = ?", [courseId]);
        if (lessonRows[0].count > 0) {
            return res.status(400).json({ message: "Không thể xóa khóa học này.", reason: "Khóa học đang chứa các bài học. Vui lòng xóa hoặc di chuyển các bài học trước." });
        }

        // Tiến hành xóa
        const [result] = await pool.query("DELETE FROM Courses WHERE course_id = ?", [courseId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy khóa học." });
        }

        res.json({ message: "✅ Xóa khóa học thành công." });
    } catch (err) {
        console.error("❌ Lỗi DELETE /courses/:id:", err.message);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa khóa học do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại (có thể từ bảng khác chưa kiểm tra)." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});


// GET /api/courses/:courseId/lessons (Lấy tất cả bài học của 1 khóa học)
// Cần verifyToken vì đây là nội dung học
router.get("/:courseId/lessons", verifyToken, async (req, res) => {
    try {
        const courseId = req.params.courseId;

        // 1. Kiểm tra xem khóa học có tồn tại không
        const [courseRows] = await pool.query("SELECT course_id, is_free FROM Courses WHERE course_id = ?", [courseId]);
        if (courseRows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy khóa học" });
        }
        
        const course = courseRows[0];
        
        // 2. 🛡️ KIỂM TRA QUYỀN TRUY CẬP KHÓA HỌC
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            // Nếu là customer, kiểm tra xem khóa học có miễn phí không
            if (course.is_free === 0) { // 0 là false
                // Nếu khóa học không miễn phí, kiểm tra xem customer có gói active không
                const [subRows] = await pool.query(`
                    SELECT user_subscription_id 
                    FROM UserSubscriptions 
                    WHERE user_id = ? AND status = 'active' AND NOW() BETWEEN start_date AND end_date
                    LIMIT 1;
                `, [req.user.id]);

                if (subRows.length === 0) {
                    return res.status(403).json({ message: "Bạn cần đăng ký gói thành viên để xem các bài học này.", accessDenied: true });
                }
            }
        }
        
        // 3. Nếu có quyền, lấy tất cả bài học thuộc khóa học đó
        const [lessonRows] = await pool.query(
            "SELECT * FROM Lessons WHERE course_id = ? ORDER BY created_at ASC", // Sắp xếp theo thứ tự
            [courseId]
        );

        res.json(lessonRows);

    } catch (err) {
        console.error("❌ Lỗi GET /courses/:courseId/lessons:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});
module.exports = router;