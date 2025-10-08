const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Hand Motions API is working!");
});

/**
 * 📌 GET /api/hand-motions
 * Lấy danh sách tất cả hand motions
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Hand_Motions");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /hand-motions:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/hand-motions/:id
 * Lấy hand motion theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .query("SELECT * FROM Hand_Motions WHERE motion_id = @motion_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /hand-motions/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/hand-motions
 * Thêm hand motion mới
 * Required: lesson_id, model_id, motion_data
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, model_id, motion_data, description } = req.body;

  if (!lesson_id || !model_id || !motion_data) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, model_id, motion_data" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id tồn tại
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // 🔍 Kiểm tra model_id tồn tại
    const checkModel = await pool.request()
      .input("model_id", sql.Int, model_id)
      .query("SELECT COUNT(*) AS count FROM AI_Models WHERE model_id = @model_id");

    if (checkModel.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid model_id: model not found" });
    }

    // ✅ Thêm mới hand motion
    await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .input("model_id", sql.Int, model_id)
      .input("motion_data", sql.NVarChar(sql.MAX), motion_data)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        INSERT INTO Hand_Motions (lesson_id, model_id, motion_data, description, created_at)
        VALUES (@lesson_id, @model_id, @motion_data, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ Hand motion added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /hand-motions:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/hand-motions/:id
 * Cập nhật hand motion
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, model_id, motion_data, description } = req.body;

  if (!lesson_id || !model_id || !motion_data) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, model_id, motion_data" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");
    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // 🔍 Kiểm tra model_id
    const checkModel = await pool.request()
      .input("model_id", sql.Int, model_id)
      .query("SELECT COUNT(*) AS count FROM AI_Models WHERE model_id = @model_id");
    if (checkModel.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid model_id: model not found" });
    }

    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("model_id", sql.Int, model_id)
      .input("motion_data", sql.NVarChar(sql.MAX), motion_data)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        UPDATE Hand_Motions
        SET lesson_id = @lesson_id,
            model_id = @model_id,
            motion_data = @motion_data,
            description = @description
        WHERE motion_id = @motion_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json({ message: "✅ Hand motion updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /hand-motions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/hand-motions/:id
 * Xóa hand motion
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .query("DELETE FROM Hand_Motions WHERE motion_id = @motion_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json({ message: "✅ Hand motion deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /hand-motions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
