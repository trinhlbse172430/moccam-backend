// 📘 swagger.js – Cấu hình Swagger hoàn chỉnh cho hệ thống Mộc Cầm (PayOS + Learning Platform)

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// ⚙️ Cấu hình Swagger (OpenAPI 3.0)
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "🎓 Mộc Cầm Learning Platform API Documentation",
      version: "1.0.0",
      description: `
## 📘 Giới thiệu

Đây là **tài liệu API chính thức** của **Mộc Cầm – Nền tảng học nhạc truyền thống Việt Nam**.  
Hệ thống bao gồm các mô-đun **quản lý người dùng**, **thanh toán PayOS**, **bài học**, **AI nhận diện**, và **theo dõi tiến độ học**.

---

### 💡 Các nhóm API chính:

| Nhóm | Chức năng |
|------|------------|
| 👤 **Users** | Quản lý người dùng, vai trò và thông tin hồ sơ |
| 🔐 **Authentication** | Đăng nhập, đăng ký, xác thực Google |
| 💳 **Payments (PayOS)** | Tạo liên kết thanh toán và xử lý giao dịch |
| 🎓 **Courses & Lessons** | Quản lý khóa học và bài học |
| 📚 **LessonProgress** | Theo dõi tiến độ học của học viên |
| 🏷️ **Vouchers** | Quản lý và áp dụng mã giảm giá |
| 🧩 **Resources** | Quản lý tài nguyên học tập (PDF, video, audio) |
| 🧠 **AI Models** | Mô hình AI phân tích âm thanh hoặc chuyển động |
| ✋ **Hand Motions** | Theo dõi chuyển động tay của học viên |
| 💬 **Comments** | Quản lý bình luận và đánh giá bài học |
| 🔔 **Notifications** | Gửi và nhận thông báo hệ thống |
| 📈 **Activity & Leaderboard** | Ghi nhận hoạt động và xếp hạng người học |

---

✅ **Phiên bản:** 1.0.0  
👨‍💻 **Nhóm phát triển:** Mộc Cầm Dev Team  
📧 **Liên hệ hỗ trợ:** moccam.business@gmail.com
      `,
      contact: {
        name: "Mộc Cầm API Team",
        email: "moccam.business@gmail.com",
      },
    },

    servers: [
      {
        url: "http://localhost:3000",
        description: "🌐 Local Development Server",
      },
      {
        url: "https://moccam-api.vercel.app",
        description: "☁️ Production Server",
      },
    ],

    components: {
      // 🔐 Cấu hình xác thực JWT (Bearer Token)
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "🔑 Nhập token JWT vào đây (ví dụ: **Bearer eyJhbGciOiJIUzI1NiIs...**)",
        },
      },

      // 📦 Các schema mẫu (tái sử dụng trong toàn hệ thống)
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "✅ Operation completed successfully",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "❌ An error occurred while processing your request",
            },
          },
        },
        AuthToken: {
          type: "object",
          properties: {
            token: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            expiresIn: {
              type: "integer",
              example: 3600,
            },
          },
        },
      },
    },

    // 🚪 Mặc định bật Bearer Token cho các route có xác thực
    security: [
      {
        bearerAuth: [],
      },
    ],
  },

  // 🧩 Đường dẫn tới các route chứa Swagger comment
  apis: ["./routes/*.js"],
};

// ✅ Sinh JSON spec cho Swagger
const specs = swaggerJsDoc(options);

// 🎨 Tùy chỉnh giao diện Swagger UI
const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar {
      background-color: #1a1f71 !important;
      padding: 10px;
    }
    .topbar-wrapper .link span {
      color: #ffffff !important;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .swagger-ui .scheme-container {
      background: #f5f7fa;
      border-radius: 10px;
      padding: 10px;
    }
    .swagger-ui .info hgroup.main a {
      color: #1a1f71 !important;
    }
    .swagger-ui .opblock {
      border-radius: 10px;
    }
    .swagger-ui .opblock.opblock-post {
      border-color: #00a86b;
      box-shadow: 0 0 5px rgba(0,168,107,0.3);
    }
    .swagger-ui .opblock.opblock-get {
      border-color: #007bff;
      box-shadow: 0 0 5px rgba(0,123,255,0.3);
    }
    .swagger-ui .opblock.opblock-put {
      border-color: #f39c12;
      box-shadow: 0 0 5px rgba(243,156,18,0.3);
    }
    .swagger-ui .opblock.opblock-delete {
      border-color: #e74c3c;
      box-shadow: 0 0 5px rgba(231,76,60,0.3);
    }
    .swagger-ui .model-title {
      font-weight: bold;
      color: #1a1f71;
    }
    .swagger-ui .markdown p {
      font-size: 15px;
      line-height: 1.6;
    }
  `,
  customSiteTitle: "🎓 Mộc Cầm API Docs",
};

// 🚀 Export để dùng trong app.js hoặc server.js
module.exports = {
  swaggerUi,
  specs,
  swaggerUiOptions,
};
