const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("AI_Models API is working!");
});

/**
 * 📌 GET /api/ai-models
 * Lấy toàn bộ danh sách mô hình AI
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM AI_Models");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /ai-models:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/ai-models/:id
 * Lấy mô hình AI theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .query("SELECT * FROM AI_Models WHERE model_id = @model_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /ai-models/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/ai-models
 * Thêm mới mô hình AI
 * Required: model_name, version
 */

router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { model_name, version, description } = req.body;

  if (!model_name || !version) {
    return res.status(400).json({ message: "Missing required fields: model_name, version" });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("model_name", sql.NVarChar(30), model_name)
      .input("version", sql.VarChar(10), version)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        INSERT INTO AI_Models (model_name, version, description, created_at)
        VALUES (@model_name, @version, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ AI Model added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /ai-models:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/ai-models/:id
 * Cập nhật thông tin mô hình AI
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { model_name, version, description } = req.body;

  if (!model_name || !version) {
    return res.status(400).json({ message: "Missing required fields: model_name, version" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .input("model_name", sql.NVarChar(30), model_name)
      .input("version", sql.VarChar(10), version)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        UPDATE AI_Models
        SET model_name = @model_name,
            version = @version,
            description = @description
        WHERE model_id = @model_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json({ message: "✅ AI Model updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /ai-models/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/ai-models/:id
 * Xóa mô hình AI
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .query("DELETE FROM AI_Models WHERE model_id = @model_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json({ message: "✅ AI Model deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /ai-models/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
