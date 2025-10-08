const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Notifications API is working!");
});

/**
 * 📌 GET /api/notifications
 * Lấy tất cả thông báo (chỉ cho admin/employee)
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT n.*, u.full_name AS user_name, u.role
      FROM Notifications n
      JOIN Users u ON n.user_id = u.user_id
      ORDER BY n.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /notifications:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/notifications/user/:user_id
 * Lấy tất cả thông báo của 1 người dùng cụ thể
 */
router.get("/user/:user_id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        SELECT * FROM Notifications
        WHERE user_id = @user_id
        ORDER BY created_at DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No notifications found for this user" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /notifications/user/:user_id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/notifications
 * Gửi thông báo mới cho user (admin/employee)
 */
router.post("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { user_id, title, message, type } = req.body;

  if (!user_id || !title || !message || !type) {
    return res.status(400).json({ message: "Missing required fields: user_id, title, message, type" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra user_id hợp lệ
    const checkUser = await pool.request()
      .input("user_id", sql.Int, user_id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");

    if (checkUser.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid user_id: user not found" });
    }

    // ✅ Thêm thông báo
    await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("title", sql.NVarChar(100), title)
      .input("message", sql.NVarChar(500), message)
      .input("type", sql.NVarChar(50), type)
      .query(`
        INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
        VALUES (@user_id, @title, @message, @type, 0, GETDATE())
      `);

    res.status(201).json({ message: "✅ Notification sent successfully" });
  } catch (err) {
    console.error("❌ Error in POST /notifications:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/notifications/read/:id
 * Đánh dấu 1 thông báo là đã đọc
 */
router.put("/read/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("notification_id", sql.Int, req.params.id)
      .query(`
        UPDATE Notifications
        SET is_read = 1,
            read_at = GETDATE()
        WHERE notification_id = @notification_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "✅ Notification marked as read" });
  } catch (err) {
    console.error("❌ Error in PUT /notifications/read/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/notifications/read-all/:user_id
 * Đánh dấu toàn bộ thông báo của 1 user là đã đọc
 */
router.put("/read-all/:user_id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        UPDATE Notifications
        SET is_read = 1,
            read_at = GETDATE()
        WHERE user_id = @user_id AND is_read = 0
      `);

    res.json({ message: `✅ Marked ${result.rowsAffected[0]} notifications as read` });
  } catch (err) {
    console.error("❌ Error in PUT /notifications/read-all/:user_id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/notifications/:id
 * Xóa 1 thông báo (admin hoặc employee)
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("notification_id", sql.Int, req.params.id)
      .query("DELETE FROM Notifications WHERE notification_id = @notification_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "✅ Notification deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /notifications/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
