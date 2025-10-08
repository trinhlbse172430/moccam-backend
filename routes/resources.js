const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Resources API is working!");
});

/**
 * 📌 GET /api/resources
 * Lấy tất cả tài nguyên học tập
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Resources");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /resources:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/resources/:id
 * Lấy tài nguyên theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .query("SELECT * FROM Resources WHERE resource_id = @resource_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /resources/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/resources
 * Thêm tài nguyên mới
 * Required: lesson_id, title, resource_type, url
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, title, resource_type, url, description } = req.body;

  if (!lesson_id || !title || !resource_type || !url) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, title, resource_type, url" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id có tồn tại không
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // ✅ Thêm mới tài nguyên
    await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .input("title", sql.NVarChar(100), title)
      .input("resource_type", sql.VarChar(10), resource_type)
      .input("url", sql.VarChar(200), url)
      .input("description", sql.NVarChar(300), description || null)
      .query(`
        INSERT INTO Resources (lesson_id, title, resource_type, url, description, created_at)
        VALUES (@lesson_id, @title, @resource_type, @url, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ Resource added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /resources:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/resources/:id
 * Cập nhật tài nguyên
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, title, resource_type, url, description } = req.body;

  if (!lesson_id || !title || !resource_type || !url) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, title, resource_type, url" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id có tồn tại không
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("title", sql.NVarChar(100), title)
      .input("resource_type", sql.VarChar(10), resource_type)
      .input("url", sql.VarChar(200), url)
      .input("description", sql.NVarChar(300), description || null)
      .query(`
        UPDATE Resources
        SET lesson_id = @lesson_id,
            title = @title,
            resource_type = @resource_type,
            url = @url,
            description = @description
        WHERE resource_id = @resource_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json({ message: "✅ Resource updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /resources/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/resources/:id
 * Xóa tài nguyên
 */
router.delete("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .query("DELETE FROM Resources WHERE resource_id = @resource_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json({ message: "✅ Resource deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /resources/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
