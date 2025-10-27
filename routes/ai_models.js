const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/ai-models/ping (Kiểm tra API)
router.get("/ping", (req, res) => {
    res.send("AI_Models API is working!");
});

// GET /api/ai-models (Lấy danh sách tất cả mô hình)
// Thường thì mọi người dùng đã login có thể xem danh sách này
router.get("/", verifyToken, async (req, res) => {
    try {
        const sqlQuery = "SELECT * FROM AI_Models ORDER BY created_at DESC";
        const [rows] = await pool.query(sqlQuery);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /ai-models:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/ai-models/:id (Lấy mô hình theo ID)
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const modelId = req.params.id;
        const sqlQuery = "SELECT * FROM AI_Models WHERE model_id = ?";
        const [rows] = await pool.query(sqlQuery, [modelId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy mô hình AI" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Lỗi GET /ai-models/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/ai-models/create (Tạo mô hình mới - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { model_name, version, description } = req.body;

    if (!model_name || !version) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: model_name, version" });
    }

    try {
        const sqlInsert = `
            INSERT INTO AI_Models (model_name, version, description, created_at)
            VALUES (?, ?, ?, NOW())
        `;
        const [result] = await pool.query(sqlInsert, [
            model_name, version, description || null
        ]);

        // Lấy lại bản ghi vừa tạo để trả về (tùy chọn)
        const [newModelRows] = await pool.query("SELECT * FROM AI_Models WHERE model_id = ?", [result.insertId]);

        res.status(201).json({ message: "✅ Thêm mô hình AI thành công", model: newModelRows[0] });
    } catch (err) {
        console.error("❌ Lỗi POST /ai-models/create:", err.message);
        // Bắt lỗi trùng tên + phiên bản nếu có UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ message: "Tên mô hình và phiên bản này đã tồn tại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/ai-models/:id (Cập nhật mô hình - Admin/Employee)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const modelId = req.params.id;
    const { model_name, version, description } = req.body;

    // Yêu cầu phải có cả tên và phiên bản khi cập nhật
    if (!model_name || !version) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: model_name, version" });
    }
     if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Không có trường nào để cập nhật." });
    }

    try {
        const sqlUpdate = `
            UPDATE AI_Models
            SET model_name = ?,
                version = ?,
                description = ?
            WHERE model_id = ?
        `;
        const [result] = await pool.query(sqlUpdate, [
            model_name, version, description || null, modelId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy mô hình AI." });
        }

        res.json({ message: "✅ Cập nhật mô hình AI thành công." });
    } catch (err) {
        console.error("❌ Lỗi PUT /ai-models/:id:", err.message);
         // Bắt lỗi trùng tên + phiên bản nếu có UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ message: "Tên mô hình và phiên bản này đã tồn tại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/ai-models/:id (Xóa mô hình - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const modelId = req.params.id;

        // (Quan trọng) Kiểm tra xem có Hand_Motions nào đang dùng model này không
        const [motionRows] = await pool.query("SELECT COUNT(*) AS count FROM Hand_Motions WHERE model_id = ?", [modelId]);
        if (motionRows[0].count > 0) {
            return res.status(400).json({ message: "Không thể xóa mô hình này.", reason: "Mô hình đang được sử dụng trong các bài tập Hand Motions." });
        }

        // Tiến hành xóa
        const [result] = await pool.query("DELETE FROM AI_Models WHERE model_id = ?", [modelId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy mô hình AI." });
        }

        res.json({ message: "✅ Xóa mô hình AI thành công." });
    } catch (err) {
        console.error("❌ Lỗi DELETE /ai-models/:id:", err.message);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa mô hình do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại (có thể từ bảng Hand_Motions)." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;