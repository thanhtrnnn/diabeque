export interface ExamTable {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ExamDiagram {
  nodes: string[];
  caption: string;
}

export interface ExamQuestion {
  id: number;
  group: string;
  title: string;
  prompt: string;
  paragraphs: string[];
  points?: string[];
  formula?: string;
  table?: ExamTable;
  diagram?: ExamDiagram;
  code?: string;
  sources?: string[];
  projectNote?: string;
  /** Thuật ngữ phải nói ra khi trả lời; được tô sáng trong đáp án. */
  keywords?: string[];
  /** Liên hệ với assignment đã làm (A1–A8, Agent02) kèm số liệu thật. */
  assignments?: string[];
}

export const EXAM_GROUPS = [
  { id: "ml", label: "Machine Learning & Deep Learning", short: "ML / DL", from: 1, to: 10 },
  { id: "cnn", label: "CNN, RNN & LSTM", short: "CNN / RNN", from: 11, to: 18 },
  { id: "kg", label: "Knowledge Graph, Neo4j & RAG", short: "KG / RAG", from: 19, to: 28 },
  { id: "agents", label: "Intelligent Agents & MAS", short: "Agent / MAS", from: 29, to: 38 },
  { id: "project", label: "Ứng dụng & đồ án Diabeque", short: "Đồ án", from: 39, to: 51 },
] as const;

export const EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: 1, group: "ml", title: "Machine Learning là gì?",
    prompt: "Explain Machine Learning. Distinguish supervised, unsupervised, and reinforcement learning, with a practical example of each.",
    keywords: ["Machine Learning", "Học có giám sát", "Học không giám sát", "Học tăng cường", "nhãn", "phần thưởng"],
    assignments: ["A1 (giá nhà Việt Nam 2024, hồi quy): Gradient Boosting tốt nhất — MAE 1,20 tỷ, RMSE 1,92 tỷ, R² 0,914, MAPE 11,1%; baseline median có R² −0,05; mô hình đóng gói thành app Android VNHousingML.", "Agent02 (notebook): Q-learning mê cung — bước −1, đâm tường −10, tới đích +50; khám phá ε-greedy; trung bình trượt 100 episode cho thấy đường đi ngắn dần."],
    paragraphs: [
      "Machine Learning (ML) xây dựng một hàm từ dữ liệu để dự đoán hoặc chọn hành động mà không phải viết sẵn mọi quy tắc cho từng trường hợp. Mô hình học tham số bằng cách tối ưu một mục tiêu trên ví dụ, rồi được đánh giá trên dữ liệu chưa dùng để huấn luyện.",
      "Học có giám sát dùng cặp đầu vào–nhãn, như phân loại hồ sơ khảo sát thành nhóm tình trạng. Học không giám sát chỉ có đầu vào và tìm cấu trúc, chẳng hạn gom nhóm bệnh nhân theo đặc trưng. Học tăng cường tương tác với môi trường, nhận thưởng/phạt theo hành động, như robot học cách đi tới đích."
    ],
    table: { headers: ["Cách học", "Tín hiệu học", "Ví dụ"], rows: [["Có giám sát", "Nhãn đúng", "Dự đoán nhóm bệnh từ khảo sát"], ["Không giám sát", "Cấu trúc trong dữ liệu", "Phân cụm hồ sơ sức khỏe"], ["Tăng cường", "Phần thưởng theo hành động", "Tác tử học đường đi trong mê cung"]] }
  },
  {
    id: 2, group: "ml", title: "Quy trình phát triển mô hình",
    prompt: "Describe the complete workflow for a Machine Learning prediction model, from data collection through testing.",
    keywords: ["pipeline", "train", "validation", "test", "rò rỉ dữ liệu", "drift", "siêu tham số"],
    assignments: ["A2: FastAPI + web + mobile, Swagger /docs, 4 artifact joblib; GET /health trả model_source ('stub' khi thiếu artifact) — tách rõ huấn luyện và suy luận.", "A5 chống rò rỉ: gộp nhãn theo image_id trước khi chia, thống kê chuẩn hóa chỉ từ train, ngưỡng phân loại chọn trên val (Diabetes 0,56, X-quang 0,35), có Grad-CAM giải thích vùng ảnh.", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52."],
    paragraphs: [
      "Bắt đầu bằng câu hỏi dự đoán, đơn vị quan sát và nhãn cần ước lượng. Thu thập dữ liệu phù hợp, kiểm tra nguồn gốc, quyền sử dụng, kiểu dữ liệu, giá trị thiếu, trùng lặp và sai lệch nhãn. Tiền xử lý và tạo đặc trưng phải được đóng gói thành pipeline để lúc suy luận làm giống lúc huấn luyện.",
      "Tách train, validation và test trước khi xem kết quả; dữ liệu theo thời gian cần tách theo thời gian. Fit mô hình trên train, chọn siêu tham số theo validation, rồi chỉ dùng test một lần để báo cáo cuối. Kiểm tra rò rỉ dữ liệu, chọn thước đo đúng mục tiêu, lưu tiền xử lý cùng mô hình. Sau triển khai cần theo dõi lỗi, độ trễ, drift và hiệu năng."
    ],
    points: ["Train: học tham số.", "Validation: chọn mô hình/ngưỡng.", "Test: ước lượng khả năng tổng quát hóa cuối cùng."]
  },
  {
    id: 3, group: "ml", title: "Phân loại và hồi quy",
    prompt: "What is the difference between classification and regression? Compare diabetes, stock, and house-price prediction.",
    keywords: ["Phân loại", "hồi quy", "nhãn rời rạc", "liên tục", "MAE", "RMSE", "F1"],
    assignments: ["A1 (giá nhà Việt Nam 2024, hồi quy): Gradient Boosting tốt nhất — MAE 1,20 tỷ, RMSE 1,92 tỷ, R² 0,914, MAPE 11,1%; baseline median có R² −0,05; mô hình đóng gói thành app Android VNHousingML.", "A2 (ba ứng dụng Kaggle): Diabetes BRFSS 253.680 dòng → Random Forest (F1 0,4886, ROC-AUC 0,8124); USA Real Estate 2,2 triệu dòng → HistGradientBoosting (R² 0,6654 trên USD); E-commerce CSAT → Logistic Regression + TF-IDF.", "A7 cổ phiếu FPT (30 phiên → giá phiên sau): RNN và LSTM đều RMSE lợi suất ≈ 1,92%, đoán đúng chiều chỉ 0,47–0,50 ≈ tung đồng xu — LSTM không thắng trên chuỗi giá nhiễu."],
    paragraphs: [
      "Phân loại dự đoán một nhãn rời rạc; hồi quy dự đoán một đại lượng số liên tục. Cùng một miền nghiệp vụ có thể đặt thành hai bài khác nhau: tiểu đường có thể là nhãn tình trạng hoặc giá trị đường huyết; chứng khoán có thể phân loại tăng/giảm hoặc hồi quy giá đóng cửa."
    ],
    table: { headers: ["Ứng dụng", "Phân loại", "Hồi quy"], rows: [["Đái tháo đường", "Nhóm tình trạng/nhãn khảo sát", "Giá trị xét nghiệm hoặc xác suất đã hiệu chỉnh"], ["Cổ phiếu", "Tăng / giảm / đi ngang", "Giá hoặc lợi suất tương lai"], ["Nhà ở", "Nhóm giá thấp / vừa / cao", "Giá bán dự kiến"]] },
    points: ["Phân loại: accuracy, precision, recall, F1, ROC-AUC.", "Hồi quy: MAE, RMSE, R²; cần so với baseline đơn giản."]
  },
  {
    id: 4, group: "ml", title: "Mạng nơ-ron nhân tạo",
    prompt: "Explain an Artificial Neural Network: input, hidden and output layers, weights, and biases.",
    keywords: ["Lớp đầu vào", "lớp ẩn", "Lớp đầu ra", "Trọng số", "Bias", "hàm kích hoạt", "softmax"],
    assignments: ["A4: một kiến trúc CNN, ba bản cài đặt NumPy scratch / Keras / PyTorch trên MNIST, CIFAR-10 và Diabetes BRFSS; dùng chung trọng số khởi tạo và thứ tự batch.", "A4: Keras lưu kernel (k, k, in, out), PyTorch (out, in, k, k); Flatten NHWC ≠ NCHW — quên sắp lại hàng Dense thì logit lệch 6,2 trên MNIST."],
    paragraphs: [
      "Lớp đầu vào nhận vector đặc trưng. Mỗi lớp ẩn tính tổ hợp tuyến tính của đầu vào rồi qua hàm kích hoạt để biểu diễn quan hệ phi tuyến. Lớp đầu ra tạo logit hoặc giá trị dự đoán; softmax thường chuyển logit thành phân phối lớp.",
      "Trọng số quyết định mức ảnh hưởng của từng kết nối. Bias dịch ngưỡng kích hoạt và giúp mô hình biểu diễn tốt hơn. Huấn luyện tìm trọng số và bias làm giảm hàm mất mát trên dữ liệu."
    ],
    formula: "a⁽ˡ⁾ = φ(W⁽ˡ⁾a⁽ˡ⁻¹⁾ + b⁽ˡ⁾)"
  },
  {
    id: 5, group: "ml", title: "Lan truyền thuận và lan truyền ngược",
    prompt: "Explain forward propagation and backpropagation. How are gradients used to update parameters?",
    keywords: ["Lan truyền thuận", "Lan truyền ngược", "quy tắc dây chuyền", "loss", "gradient", "epoch"],
    assignments: ["A4: gradcheck so đạo hàm viết tay với sai phân hữu hạn — sai số tương đối lớn nhất 2,3e−6.", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52.", "A7: RNN = hợp 5 hàm sơ cấp mỗi bước, LSTM = hợp 17 hàm; tính Jacobian theo quy tắc dây chuyền và đo độ nhạy ‖∂s_T/∂s_{T−k}‖ để thấy gradient tắt dần."],
    paragraphs: [
      "Lan truyền thuận đưa mẫu qua từng lớp: nhân ma trận, cộng bias, áp dụng activation và tính đầu ra. So sánh dự đoán với nhãn để nhận loss.",
      "Lan truyền ngược dùng quy tắc dây chuyền để tính đạo hàm loss theo từng tham số, bắt đầu từ lớp cuối về lớp đầu. Bộ tối ưu cập nhật tham số theo hướng làm loss giảm; sau nhiều epoch, kiểm tra validation để phát hiện quá khớp."
    ],
    formula: "θₜ₊₁ = θₜ − η ∇θ L(θₜ)"
  },
  {
    id: 6, group: "ml", title: "Hàm mất mát",
    prompt: "Compare MSE, Binary Cross-Entropy, and Categorical Cross-Entropy, and give an application for each.",
    keywords: ["MSE", "Binary Cross-Entropy", "Categorical Cross-Entropy", "sigmoid", "softmax", "trọng số lớp"],
    assignments: ["A4: một kiến trúc CNN, ba bản cài đặt NumPy scratch / Keras / PyTorch trên MNIST, CIFAR-10 và Diabetes BRFSS; dùng chung trọng số khởi tạo và thứ tự batch.", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52.", "Tiểu luận Chap 1–4: BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng); status3 CNN-1D macro-F1 0,4309 ± 0,0018; Type 1/2 LSTM 0,5745 ± 0,0157 (3 seed); MLP của A8 chỉ 0,4264."],
    paragraphs: [
      "Loss đo độ sai giữa dự đoán và mục tiêu để mô hình có tín hiệu tối ưu. MSE phạt bình phương sai số số học nên hợp với hồi quy, nhưng nhạy với ngoại lệ. Binary Cross-Entropy dùng cho nhãn nhị phân với xác suất sigmoid; Categorical Cross-Entropy dùng cho nhiều lớp loại trừ nhau với softmax.",
      "Cần ghép đầu ra, nhãn và loss cho đúng. Với dữ liệu lệch lớp, có thể dùng trọng số lớp hoặc loss khác, nhưng vẫn phải báo cáo precision/recall theo lớp và kiểm tra hiệu chỉnh xác suất."
    ],
    table: { headers: ["Loss", "Đầu ra thường dùng", "Ví dụ"], rows: [["MSE", "Một số thực", "Dự đoán giá nhà"], ["Binary Cross-Entropy", "Sigmoid, 2 lớp", "Có / không mắc theo nhãn khảo sát"], ["Categorical Cross-Entropy", "Softmax, nhiều lớp", "Không báo cáo / tiền ĐTĐ / ĐTĐ"]] }
  },
  {
    id: 7, group: "ml", title: "Gradient Descent và learning rate",
    prompt: "Explain Batch, Stochastic, and Mini-Batch Gradient Descent. What does the learning rate do?",
    keywords: ["Batch Gradient Descent", "Stochastic Gradient Descent", "Mini-batch", "Learning rate", "bộ tối ưu thích nghi"],
    assignments: ["A4: sau một bước Adam, NumPy và PyTorch khớp tới 1e−7 còn Keras lệch 1e−4 (Keras gộp bias correction vào learning rate; epsilon mặc định 1e−7 vs 1e−8).", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52."],
    paragraphs: [
      "Batch Gradient Descent tính gradient trên toàn bộ tập huấn luyện mỗi bước: ổn định nhưng tốn bộ nhớ và chậm. Stochastic Gradient Descent dùng một mẫu mỗi bước: cập nhật nhanh nhưng nhiễu. Mini-batch dùng nhóm nhỏ, tận dụng vector hóa phần cứng và thường cân bằng tốc độ với độ ổn định.",
      "Learning rate η quyết định độ dài bước. Quá lớn có thể vượt qua điểm tối ưu hoặc phân kỳ; quá nhỏ làm học lâu. Có thể giảm learning rate theo lịch hoặc dùng bộ tối ưu thích nghi, nhưng cần đánh giá trên validation."
    ],
    formula: "θ ← θ − η · gradient của loss"
  },
  {
    id: 8, group: "ml", title: "Overfitting, underfitting và các tập dữ liệu",
    prompt: "Define overfitting and underfitting. Explain train/validation/test splits, regularization, dropout, and early stopping.",
    keywords: ["Underfitting", "Overfitting", "Regularization", "dropout", "early stopping", "leakage", "validation"],
    assignments: ["A5 chống rò rỉ: gộp nhãn theo image_id trước khi chia, thống kê chuẩn hóa chỉ từ train, ngưỡng phân loại chọn trên val (Diabetes 0,56, X-quang 0,35), có Grad-CAM giải thích vùng ảnh.", "A5: sâu hơn giúp X-quang (+0,046 F1) nhưng không giúp CIFAR-10 (−0,018) hay Diabetes (−0,004) — tăng tầng không mặc nhiên tốt hơn.", "A7 cổ phiếu FPT (30 phiên → giá phiên sau): RNN và LSTM đều RMSE lợi suất ≈ 1,92%, đoán đúng chiều chỉ 0,47–0,50 ≈ tung đồng xu — LSTM không thắng trên chuỗi giá nhiễu."],
    paragraphs: [
      "Underfitting xảy ra khi mô hình quá đơn giản hoặc học chưa đủ nên sai cả trên train lẫn dữ liệu mới. Overfitting xảy ra khi mô hình học cả nhiễu/chi tiết riêng của train: train tốt nhưng validation/test kém.",
      "Train dùng để học; validation dùng chọn kiến trúc, siêu tham số và thời điểm dừng; test giữ kín để đánh giá cuối. Regularization phạt độ phức tạp, dropout bỏ ngẫu nhiên một phần kích hoạt khi train, còn early stopping dừng khi validation không cải thiện. Chia dữ liệu trước khi fit preprocessing để tránh leakage."
    ]
  },
  {
    id: 9, group: "ml", title: "Đánh giá mô hình phân loại",
    prompt: "Explain accuracy, precision, recall, F1, and the confusion matrix. Why can accuracy mislead on imbalanced diabetes data?",
    keywords: ["Confusion matrix", "Accuracy", "precision", "recall", "F1", "macro-F1"],
    assignments: ["A2 (ba ứng dụng Kaggle): Diabetes BRFSS 253.680 dòng → Random Forest (F1 0,4886, ROC-AUC 0,8124); USA Real Estate 2,2 triệu dòng → HistGradientBoosting (R² 0,6654 trên USD); E-commerce CSAT → Logistic Regression + TF-IDF.", "A4: accuracy test MNIST 0,984 · CIFAR-10 0,676–0,678 · Diabetes 0,837 (macro-F1 ≈ 0,586); ba bản lệch nhau ≤ 0,15 điểm %; scratch chậm 7–10× trên ảnh.", "A5 chống rò rỉ: gộp nhãn theo image_id trước khi chia, thống kê chuẩn hóa chỉ từ train, ngưỡng phân loại chọn trên val (Diabetes 0,56, X-quang 0,35), có Grad-CAM giải thích vùng ảnh."],
    paragraphs: [
      "Confusion matrix đếm dự đoán đúng/sai theo từng lớp. Accuracy là tỷ lệ đúng chung; precision = TP/(TP+FP) cho biết trong số ca dự đoán dương có bao nhiêu đúng; recall = TP/(TP+FN) đo số ca dương được tìm thấy; F1 là trung bình điều hòa precision và recall.",
      "Nếu lớp phổ biến chiếm đa số, mô hình luôn đoán lớp đó vẫn có accuracy cao nhưng bỏ sót lớp tiền tiểu đường hoặc tiểu đường. Vì vậy nên báo confusion matrix, precision/recall từng lớp và macro-F1, vốn cho mỗi lớp trọng số ngang nhau."
    ],
    formula: "Precision = TP/(TP+FP) · Recall = TP/(TP+FN) · F1 = 2PR/(P+R)",
    table: { headers: ["Chỉ số", "Trả lời câu hỏi"], rows: [["Precision", "Các ca mô hình gắn nhãn dương chính xác đến đâu?"], ["Recall", "Mô hình tìm được bao nhiêu ca dương?"], ["Macro-F1", "Hiệu năng trung bình giữa các lớp có cân bằng không?"], ["Accuracy", "Tỷ lệ đúng chung, có thể che lớp hiếm"]] }
  },
  {
    id: 10, group: "ml", title: "Mô hình và thách thức triển khai",
    prompt: "Compare classification and regression in practice. What challenges arise when deploying a trained Deep Learning model as a web app or API?",
    keywords: ["preprocessing", "phiên bản model", "kiểm tra đầu vào", "độ trễ", "logging", "drift"],
    assignments: ["ass_00 (Chương 12): KNN Pima (Glucose, BMI, Age) lưu joblib, phục vụ bằng Flask app.py + Streamlit + client.py — ví dụ triển khai tối giản.", "A2: điểm cao nhất ≠ triển khai tốt nhất — LinearSVC F1-macro 0,7816 nhưng không có predict_proba nên chọn Logistic Regression (0,7811); artifact Random Forest 21,9 MB vẫn chấp nhận được trên server, không hợp chạy trên mobile.", "A2: FastAPI + web + mobile, Swagger /docs, 4 artifact joblib; GET /health trả model_source ('stub' khi thiếu artifact) — tách rõ huấn luyện và suy luận.", "A1 (giá nhà Việt Nam 2024, hồi quy): Gradient Boosting tốt nhất — MAE 1,20 tỷ, RMSE 1,92 tỷ, R² 0,914, MAPE 11,1%; baseline median có R² −0,05; mô hình đóng gói thành app Android VNHousingML."],
    paragraphs: [
      "Phân loại trả nhãn/xác suất cho nhóm rời rạc; hồi quy trả giá trị liên tục. Khi chọn bài toán, phải xét chi phí của dương tính giả, âm tính giả và sai số số học, không chỉ chọn mô hình có điểm cao nhất.",
      "Triển khai cần giữ đúng thứ tự đặc trưng và preprocessing, quản lý phiên bản model, kiểm tra đầu vào, đóng gói phụ thuộc, giới hạn tài nguyên/độ trễ, xử lý lỗi, bảo vệ dữ liệu, logging có kiểm soát và giám sát drift. Với sản phẩm sức khỏe phải ghi rõ giới hạn và có đường chuyển tới chuyên gia."
    ]
  },
  {
    id: 11, group: "cnn", title: "Kiến trúc CNN",
    prompt: "Explain CNN layers, filters, feature maps, activation functions, and pooling.",
    keywords: ["kernel", "filter", "feature map", "ReLU", "Pooling", "stride", "flatten"],
    assignments: ["A4: một kiến trúc CNN, ba bản cài đặt NumPy scratch / Keras / PyTorch trên MNIST, CIFAR-10 và Diabetes BRFSS; dùng chung trọng số khởi tạo và thứ tự batch.", "A5: CNN 3 tầng vs 5 tầng × Keras/PyTorch × 3 bộ = 12 thí nghiệm; X-quang VinBigData (15.000 ảnh, 29,3% bất thường) F1 0,876 với PyTorch 5 tầng; CIFAR-10 F1 0,760; Diabetes F1 0,492."],
    paragraphs: [
      "CNN áp dụng các kernel dùng chung trên vùng cục bộ của ảnh. Mỗi filter học mẫu như cạnh hoặc kết cấu; kết quả quét tạo feature map. Hàm kích hoạt, thường là ReLU, thêm phi tuyến. Pooling hoặc stride giảm kích thước không gian để giảm tính toán và giữ tín hiệu nổi bật.",
      "Các tầng đầu thường nhận ra cạnh/màu; tầng sâu ghép thành bộ phận và cấu trúc lớn. Cuối mạng thường có global pooling hoặc flatten rồi lớp phân loại."
    ],
    diagram: { nodes: ["Ảnh đầu vào", "Conv + ReLU", "Feature maps", "Pooling", "Đặc trưng → lớp"], caption: "Một CNN phân loại ảnh điển hình." }
  },
  {
    id: 12, group: "cnn", title: "Phép tích chập",
    prompt: "Describe convolution and the roles of kernel size, stride, padding, and number of filters.",
    keywords: ["Kernel", "stride", "padding", "số filter", "feature map"],
    assignments: ["A5: src/cnn_concepts.py cài convolution, padding, stride, pooling bằng NumPy, có test đối chiếu kích thước đầu ra.", "A4: Keras lưu kernel (k, k, in, out), PyTorch (out, in, k, k); Flatten NHWC ≠ NCHW — quên sắp lại hàng Dense thì logit lệch 6,2 trên MNIST."],
    paragraphs: [
      "Kernel trượt qua ảnh; tại mỗi vị trí nó nhân từng pixel với trọng số tương ứng rồi cộng lại để tạo một giá trị trên feature map. Trọng số kernel được học trong huấn luyện.",
      "Kernel lớn nhìn vùng rộng hơn nhưng tăng chi phí; stride là số pixel dịch mỗi lần; padding thêm biên để kiểm soát kích thước và giữ thông tin rìa; số filter quyết định số kênh đặc trưng học song song."
    ],
    formula: "Kích thước đầu ra mỗi chiều = ⌊(N + 2P − K)/S⌋ + 1"
  },
  {
    id: 13, group: "cnn", title: "Vì sao CNN hiệu quả với ảnh?",
    prompt: "Why are CNNs effective for image classification, and how do learned features become more complex across layers?",
    keywords: ["cấu trúc không gian", "tính cục bộ", "chia sẻ kernel", "ít tham số", "Tầng nông", "tầng sâu"],
    assignments: ["A4: accuracy test MNIST 0,984 · CIFAR-10 0,676–0,678 · Diabetes 0,837 (macro-F1 ≈ 0,586); ba bản lệch nhau ≤ 0,15 điểm %; scratch chậm 7–10× trên ảnh.", "A5: sâu hơn giúp X-quang (+0,046 F1) nhưng không giúp CIFAR-10 (−0,018) hay Diabetes (−0,004) — tăng tầng không mặc nhiên tốt hơn."],
    paragraphs: [
      "Ảnh có cấu trúc không gian: pixel gần nhau liên quan. Tích chập khai thác tính cục bộ và chia sẻ kernel giữa vị trí nên ít tham số hơn kết nối đầy đủ trên toàn ảnh, đồng thời giữ quan hệ vị trí.",
      "Tầng nông học cạnh, góc và màu; tầng giữa ghép thành kết cấu hoặc bộ phận; tầng sâu kết hợp thành vật thể. Pooling/stride giúp bớt nhạy với dịch chuyển nhỏ, nhưng CNN vẫn cần dữ liệu đa dạng và tiền xử lý đúng."
    ]
  },
  {
    id: 14, group: "cnn", title: "Phát triển ứng dụng phân loại ảnh",
    prompt: "Describe the image-classification workflow: preprocessing, training, validation, inference, and deployment.",
    keywords: ["Augmentation", "resize", "normalize", "confusion matrix", "validation", "API"],
    assignments: ["A4: accuracy test MNIST 0,984 · CIFAR-10 0,676–0,678 · Diabetes 0,837 (macro-F1 ≈ 0,586); ba bản lệch nhau ≤ 0,15 điểm %; scratch chậm 7–10× trên ảnh.", "A5: CNN 3 tầng vs 5 tầng × Keras/PyTorch × 3 bộ = 12 thí nghiệm; X-quang VinBigData (15.000 ảnh, 29,3% bất thường) F1 0,876 với PyTorch 5 tầng; CIFAR-10 F1 0,760; Diabetes F1 0,492.", "A5 chống rò rỉ: gộp nhãn theo image_id trước khi chia, thống kê chuẩn hóa chỉ từ train, ngưỡng phân loại chọn trên val (Diabetes 0,56, X-quang 0,35), có Grad-CAM giải thích vùng ảnh."],
    paragraphs: [
      "Thu thập ảnh có nhãn và quyền sử dụng; loại ảnh hỏng, chuẩn hóa kích thước/kênh màu, chia tập theo nguồn hoặc đối tượng để tránh ảnh gần trùng ở cả train và test. Augmentation chỉ áp dụng ở train và phải giữ nguyên ý nghĩa nhãn.",
      "Huấn luyện CNN, chọn cấu hình theo validation, đánh giá test bằng confusion matrix và chỉ số phù hợp. Khi suy luận phải dùng lại cùng resize/normalize, lưu model và nhãn cùng phiên bản. API nhận ảnh an toàn, giới hạn kích thước, trả nhãn/xác suất và theo dõi lỗi."
    ],
    projectNote: "Đồ án Diabeque dùng đặc trưng khảo sát dạng bảng; phần phân loại ảnh đã làm thật ở A4 (MNIST, CIFAR-10) và A5 (X-quang VinBigData)."
  },
  {
    id: 15, group: "cnn", title: "Recurrent Neural Network",
    prompt: "What is an RNN? Explain its hidden state and information flow through a sequence.",
    keywords: ["RNN", "hidden state", "Cùng một trọng số", "phụ thuộc dài hạn"],
    assignments: ["A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52.", "A7: RNN = hợp 5 hàm sơ cấp mỗi bước, LSTM = hợp 17 hàm; tính Jacobian theo quy tắc dây chuyền và đo độ nhạy ‖∂s_T/∂s_{T−k}‖ để thấy gradient tắt dần."],
    paragraphs: [
      "RNN đọc chuỗi theo thứ tự. Ở thời điểm t, nó kết hợp phần tử hiện tại xₜ với hidden state hₜ₋₁ để tạo hₜ; state này tóm tắt ngữ cảnh đã đọc. Cùng một trọng số được dùng qua các thời điểm nên mô hình có thể xử lý chuỗi dài khác nhau.",
      "RNN phù hợp với văn bản, tín hiệu hoặc dữ liệu thời gian, nhưng việc lan truyền gradient qua nhiều bước khiến học phụ thuộc dài hạn khó."
    ],
    formula: "hₜ = tanh(Wₓxₜ + Wₕhₜ₋₁ + b)"
  },
  {
    id: 16, group: "cnn", title: "Vanishing và exploding gradients",
    prompt: "What are vanishing and exploding gradients in RNNs, and how do they harm long-term dependency learning?",
    keywords: ["vanishing", "exploding", "Jacobian", "clipping", "LSTM/GRU"],
    assignments: ["A7: RNN = hợp 5 hàm sơ cấp mỗi bước, LSTM = hợp 17 hàm; tính Jacobian theo quy tắc dây chuyền và đo độ nhạy ‖∂s_T/∂s_{T−k}‖ để thấy gradient tắt dần.", "A7 bình luận TGDĐ (3 lớp cảm xúc): LSTM macro-F1 0,651 vs RNN 0,594 (Keras) — cổng nhớ giúp câu dài."],
    paragraphs: [
      "Khi gradient truyền ngược qua nhiều bước thời gian, nó nhân liên tiếp các Jacobian. Nếu tích có độ lớn nhỏ hơn 1, gradient tiến về 0 (vanishing), tín hiệu từ quá khứ xa không cập nhật được. Nếu tích lớn hơn 1, gradient phình ra (exploding), làm cập nhật bất ổn.",
      "Có thể dùng clipping để giới hạn gradient nổ; khởi tạo, chuẩn hóa, kết nối residual và thiết kế cổng như LSTM/GRU hỗ trợ học dài hạn. Các cách này giảm vấn đề nhưng không bảo đảm mô hình luôn nhớ mọi phụ thuộc."
    ]
  },
  {
    id: 17, group: "cnn", title: "Các cổng trong LSTM",
    prompt: "Explain the LSTM forget, input, and output gates, cell state, and hidden state.",
    keywords: ["cell state", "hidden state", "Forget gate", "input gate", "output gate", "sigmoid", "tanh"],
    assignments: ["A7: RNN = hợp 5 hàm sơ cấp mỗi bước, LSTM = hợp 17 hàm; tính Jacobian theo quy tắc dây chuyền và đo độ nhạy ‖∂s_T/∂s_{T−k}‖ để thấy gradient tắt dần.", "A7 bình luận TGDĐ (3 lớp cảm xúc): LSTM macro-F1 0,651 vs RNN 0,594 (Keras) — cổng nhớ giúp câu dài."],
    paragraphs: [
      "LSTM duy trì cell state cₜ như bộ nhớ dài hạn và hidden state hₜ làm biểu diễn đầu ra hiện tại. Forget gate quyết định phần nào của bộ nhớ cũ cần giữ; input gate chọn thông tin mới ghi vào; output gate quyết định phần cell state được đưa ra hidden state.",
      "Các cổng dùng sigmoid cho hệ số từ 0 đến 1; ứng viên trạng thái thường dùng tanh. Đường cập nhật cell state gần tuyến tính giúp gradient truyền qua thời gian ổn định hơn RNN cơ bản."
    ],
    formula: "fₜ=σ(…), iₜ=σ(…), cₜ=fₜ⊙cₜ₋₁+iₜ⊙ĉₜ, oₜ=σ(…), hₜ=oₜ⊙tanh(cₜ)"
  },
  {
    id: 18, group: "cnn", title: "So sánh RNN, LSTM và CNN",
    prompt: "Compare RNN, LSTM, and CNN; explain why RNN/LSTM may suit stock time-series prediction.",
    keywords: ["RNN", "LSTM", "CNN", "1D-CNN", "baseline", "leakage", "tách dữ liệu theo thời gian"],
    assignments: ["A7 cổ phiếu FPT (30 phiên → giá phiên sau): RNN và LSTM đều RMSE lợi suất ≈ 1,92%, đoán đúng chiều chỉ 0,47–0,50 ≈ tung đồng xu — LSTM không thắng trên chuỗi giá nhiễu.", "A7 bình luận TGDĐ (3 lớp cảm xúc): LSTM macro-F1 0,651 vs RNN 0,594 (Keras) — cổng nhớ giúp câu dài.", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52.", "Tiểu luận Chap 1–4: BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng); status3 CNN-1D macro-F1 0,4309 ± 0,0018; Type 1/2 LSTM 0,5745 ± 0,0157 (3 seed); MLP của A8 chỉ 0,4264."],
    paragraphs: [
      "RNN và LSTM xử lý phần tử theo trình tự và truyền trạng thái giữa các bước; LSTM có cổng/bộ nhớ để học phụ thuộc dài. CNN khai thác mẫu cục bộ song song; 1D-CNN cũng có thể xử lý chuỗi và thường nhanh hơn khi mẫu nằm trong cửa sổ ngắn.",
      "Chuỗi giá cổ phiếu có thứ tự thời gian nên RNN/LSTM có thể mô hình hóa ngữ cảnh lịch sử. Tuy nhiên, mô hình không tự bảo đảm dự báo tốt: phải tách dữ liệu theo thời gian, so sánh baseline, tránh leakage và đánh giá ngoài mẫu."
    ],
    table: { headers: ["Mạng", "Điểm mạnh", "Giới hạn / ví dụ"], rows: [["CNN", "Mẫu cục bộ, tính toán song song", "Ảnh; cửa sổ thời gian ngắn"], ["RNN", "Trạng thái theo thứ tự", "Chuỗi tuần tự, khó học phụ thuộc dài"], ["LSTM", "Cổng và bộ nhớ dài hạn", "Chuỗi dài hơn; tốn tính toán hơn"]] },
    projectNote: "Diabeque đưa 19 đặc trưng khảo sát vào CNN-1D/LSTM như một trục đặc trưng; đó không phải chuỗi thời gian bệnh nhân."
  },
  {
    id: 19, group: "kg", title: "Knowledge Graph là gì?",
    prompt: "Define a Knowledge Graph: entities, relationships, properties, and attributes, with a diabetes example.",
    keywords: ["Knowledge Graph", "node", "cạnh", "thuộc tính", "HAS_RISK_FACTOR"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "Knowledge Graph (KG) biểu diễn sự kiện thành đồ thị có ý nghĩa: node là thực thể, cạnh có kiểu cho biết quan hệ, thuộc tính lưu chi tiết. Ví dụ Disease(đái tháo đường típ 2) —HAS_RISK_FACTOR→ RiskFactor(thừa cân); mỗi sự kiện có thể nối tới đoạn tài liệu hỗ trợ.",
      "KG giúp truy vấn theo thực thể và đường quan hệ, trong khi tài liệu văn bản giữ phần giải thích phong phú. Phải phân biệt quan hệ dữ liệu với kết luận lâm sàng."
    ]
  },
  {
    id: 20, group: "kg", title: "Bộ ba chủ thể – vị từ – đối tượng",
    prompt: "Explain subject-predicate-object triples and construct five triples for a simple diabetes KG.",
    keywords: ["triple", "chủ thể", "quan hệ", "đối tượng"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "Một triple có dạng (chủ thể, quan hệ, đối tượng). Các triple có thể ghép thành đồ thị; thuộc tính bổ sung bối cảnh như nguồn, thời điểm hoặc đơn vị đo."
    ],
    table: { headers: ["Chủ thể", "Vị từ", "Đối tượng"], rows: [["Đái tháo đường típ 2", "CÓ_TRIỆU_CHỨNG", "Khát nhiều"], ["Đái tháo đường típ 2", "CÓ_YẾU_TỐ_NGUY_CƠ", "Thừa cân"], ["Đo HbA1c", "ĐO", "Mức glucose trung bình"], ["Bệnh nhân A", "CÓ_SỐ_ĐO", "BMI = 29"], ["Khuyến nghị", "ĐƯỢC_HỖ_TRỢ_BỞI", "Tài liệu nguồn"]] },
    projectNote: "Đây là lược đồ đề xuất cho câu hỏi; KG hiện tại không lưu Patient thật, mà tập trung vào facts, chunk nguồn và survey records."
  },
  {
    id: 21, group: "kg", title: "Neo4j và property graph",
    prompt: "What is Neo4j? Explain its property-graph model: nodes, relationships, and properties.",
    keywords: ["Neo4j", "property graph", "label", "relationship", "Cypher", "constraint"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "Neo4j là hệ quản trị cơ sở dữ liệu đồ thị. Trong property graph, node mang một hoặc nhiều label cùng key-value properties; relationship có kiểu, hướng và cũng có properties. Chỉ mục/constraint hỗ trợ tìm kiếm và bảo đảm định danh.",
      "Cypher mô tả pattern cần khớp, ví dụ (d:Disease)-[:HAS_SYMPTOM]->(s:Symptom). Neo4j của dự án lưu Document, Chunk, Disease, các node dữ kiện (Symptom, RiskFactor, Complication, Recommendation, DrugClass) và SurveyRecord/SurveyStatus, nối bằng PART_OF, HAS_* và SUPPORTED_BY."
    ]
  },
  {
    id: 22, group: "kg", title: "Cypher cơ bản",
    prompt: "Write Cypher to create a Patient, Disease, and relationship, then retrieve them.",
    keywords: ["MERGE", "CREATE", "MATCH", "tham số hóa"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "MERGE tạo hoặc tìm node theo thuộc tính khóa; CREATE luôn thêm mới. Relationship nên được tạo giữa node đã khớp. Trong ứng dụng thật, tham số hóa truy vấn và tránh lưu thông tin định danh nhạy cảm nếu không cần."
    ],
    code: "MERGE (p:Patient {id: $patient_id})\nMERGE (d:Disease {id: 'diabetes_type2'})\nMERGE (p)-[:HAS_DIAGNOSIS]->(d)\nRETURN p.id AS patient, d.id AS disease\n\nMATCH (p:Patient {id: $patient_id})-[:HAS_DIAGNOSIS]->(d:Disease)\nRETURN p, d"
  },
  {
    id: 23, group: "kg", title: "Thiết kế KG cho bệnh tiểu đường",
    prompt: "Design a diabetes KG with patients, symptoms, risk factors, measurements, diseases, and recommendations.",
    keywords: ["Disease", "Symptom", "RiskFactor", "Recommendation", "SUPPORTED_BY", "PART_OF", "khử định danh"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "Mô hình hóa Disease, Symptom, RiskFactor, Measurement, Recommendation, Document và Chunk. Các quan hệ như HAS_SYMPTOM, HAS_RISK_FACTOR, HAS_RECOMMENDATION, PART_OF và SUPPORTED_BY nối dữ kiện y tế với đoạn nguồn. Patient/Measurement chỉ nên dùng dữ liệu giả hoặc đã được phê duyệt, khử định danh.",
      "Mỗi số đo nên có giá trị, đơn vị, thời điểm và nguồn. Mỗi khuyến nghị cần nối tới tài liệu chứng minh để người xem truy nguyên được; không suy ra chẩn đoán chỉ từ việc một cạnh tồn tại."
    ],
    diagram: { nodes: ["Disease", "RiskFactor / Symptom", "Supported by", "Chunk → Document"], caption: "Ví dụ đường đi từ bệnh tới dữ kiện và tài liệu làm bằng chứng." }
  },
  {
    id: 24, group: "kg", title: "Truy vấn và suy luận trên Neo4j",
    prompt: "How can Neo4j support knowledge retrieval and reasoning? Give a multi-relationship traversal example.",
    keywords: ["pattern nhiều bước", "trích dẫn", "nhân quả"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote).", "A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh."],
    paragraphs: [
      "Neo4j truy xuất thực thể và các láng giềng theo pattern nhiều bước. Chẳng hạn bệnh → yếu tố nguy cơ → đoạn tài liệu → tài liệu nguồn; đường đi cho biết vì sao đoạn đó liên quan và giúp gắn trích dẫn.",
      "Đây là suy luận trên cấu trúc đã lưu, không đồng nghĩa hệ thống chứng minh nhân quả. Quy tắc mới cần được định nghĩa, kiểm thử và gắn nguồn riêng."
    ],
    code: "MATCH (d:Disease {id: $disease})-[:HAS_RISK_FACTOR]->(f:RiskFactor)\n      -[:SUPPORTED_BY]->(c:Chunk)-[:PART_OF]->(doc:Document)\nRETURN f.name_vi, c.text, doc.title, doc.url"
  },
  {
    id: 25, group: "kg", title: "Retrieval-Augmented Generation",
    prompt: "What is RAG, and why combine retrieval with a Large Language Model?",
    keywords: ["RAG", "Retrieval", "LLM", "trích dẫn", "từ chối"],
    assignments: ["A8 / Chap 5: vector + mở rộng đồ thị trả lời 25/26 câu, 97,9% phát biểu có nguồn hỗ trợ, 4/4 câu ngoài phạm vi bị từ chối; cổng trích dẫn phải chuẩn hóa [[S5]] / [[1, 3]] của gemma-4."],
    paragraphs: [
      "RAG tìm các đoạn nguồn liên quan trước, rồi đưa câu hỏi cùng bằng chứng vào LLM để tạo câu trả lời. Retrieval giúp nội dung bám vào kho tri thức cập nhật; LLM giúp tổng hợp bằng ngôn ngữ tự nhiên.",
      "RAG vẫn có thể lấy sai đoạn hoặc diễn giải quá nguồn. Cần đánh giá retrieval độc lập, yêu cầu trích dẫn, từ chối khi ngoài phạm vi và kiểm tra câu trả lời có được nguồn hỗ trợ."
    ],
    diagram: { nodes: ["Câu hỏi", "Tìm bằng chứng", "LLM tổng hợp", "Trả lời + nguồn"], caption: "RAG ghép truy xuất tài liệu với sinh câu trả lời." }
  },
  {
    id: 26, group: "kg", title: "Kiến trúc đầy đủ của RAG",
    prompt: "Describe document ingestion, chunking, embeddings, vector storage, retrieval, and response generation.",
    keywords: ["ingest", "chunks", "metadata", "embedding", "top-k", "xếp hạng lại", "trích dẫn"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote).", "A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh."],
    paragraphs: [
      "Ở khâu ingest, chọn nguồn, trích xuất và làm sạch văn bản; chia thành chunks có kích thước phù hợp, giữ metadata/URL; tạo embedding rồi lưu vector cùng nội dung. Có thể lập chỉ mục lexical và đồ thị bổ sung.",
      "Khi hỏi, tạo embedding truy vấn, tìm top-k, lọc hoặc xếp hạng lại, gửi các đoạn cùng nguồn vào LLM. Kiểm cổng trích dẫn và giới hạn câu trả lời theo bằng chứng. Phiên bản tài liệu, chunking, model nhúng và bộ câu hỏi đánh giá đều cần ghi lại."
    ],
    diagram: { nodes: ["Tài liệu", "Làm sạch + chia chunk", "Embedding + lưu trữ", "Truy xuất top-k", "LLM + kiểm nguồn"], caption: "Luồng offline ingest và online hỏi đáp được nối ở kho vector/tri thức." }
  },
  {
    id: 27, group: "kg", title: "Keyword, vector và graph retrieval",
    prompt: "Compare keyword retrieval, vector similarity search, and Knowledge Graph retrieval.",
    keywords: ["BM25", "Vector search", "Graph retrieval", "fusion"],
    assignments: ["A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh."],
    paragraphs: [
      "Tìm từ khóa như BM25 dễ giải thích và tốt khi khớp thuật ngữ, nhưng bỏ lỡ diễn đạt đồng nghĩa. Vector search tìm ngữ nghĩa gần nhau, kể cả khác từ, nhưng phụ thuộc embedding và có thể lấy đoạn nghe gần mà sai nghĩa. Graph retrieval theo thực thể/quan hệ, tốt cho câu hỏi nhiều bước nhưng cần schema và dữ liệu đồ thị đúng.",
      "Có thể kết hợp các nhánh rồi hợp nhất thứ hạng, song phải đo trên tập truy vấn có nhãn; thêm một nhánh không mặc nhiên cải thiện chất lượng."
    ],
    table: { headers: ["Cách truy xuất", "Ưu điểm", "Hạn chế"], rows: [["Từ khóa", "Nhanh, dễ giải thích", "Kém với từ đồng nghĩa/diễn đạt mới"], ["Vector", "Khớp ngữ nghĩa", "Phụ thuộc embedding, có thể lệch ý"], ["Đồ thị", "Theo được quan hệ nhiều bước", "Cần KG đầy đủ, lược đồ đúng"], ["Kết hợp", "Bù điểm yếu giữa nhánh", "Cần fusion và đánh giá cẩn thận"]] }
  },
  {
    id: 28, group: "kg", title: "Tích hợp Neo4j và RAG vào trợ lý",
    prompt: "How can Neo4j and RAG work together in a diabetes assistant?",
    keywords: ["embedding", "Chunk", "graph expansion", "vector search", "BM25", "gate"],
    assignments: ["A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh.", "A8 / Chap 5: vector + mở rộng đồ thị trả lời 25/26 câu, 97,9% phát biểu có nguồn hỗ trợ, 4/4 câu ngoài phạm vi bị từ chối; cổng trích dẫn phải chuẩn hóa [[S5]] / [[1, 3]] của gemma-4."],
    paragraphs: [
      "Trợ lý nhận diện chủ đề, tạo embedding câu hỏi và truy xuất các Chunk trong Neo4j; graph expansion có thể bổ sung đoạn nối với cùng facts. LLM nhận nội dung và URL nguồn để viết câu trả lời; bộ gate kiểm tra phạm vi và trích dẫn.",
      "Trong mã hiện tại, vector search là nhánh xếp hạng mặc định, còn graph được dùng để mở rộng thêm ngữ cảnh; BM25 có trong pipeline nhưng không bật mặc định. Đây là truy xuất có nguồn, không phải KG tự chẩn đoán bệnh."
    ],
    sources: ["chap6-agents/backend/app/retrieval.py", "chap6-agents/backend/app/agents/tools.py", "chap6-agents/backend/app/answer.py"]
  },
  {
    id: 29, group: "agents", title: "Tác tử thông minh",
    prompt: "Define an Intelligent Agent using environment, perception, state, action, goal, and decision-making.",
    keywords: ["Tác tử", "quan sát", "trạng thái", "hành động", "mục tiêu", "phản hồi"],
    assignments: ["Agent02 (notebook): Q-learning mê cung — bước −1, đâm tường −10, tới đích +50; khám phá ε-greedy; trung bình trượt 100 episode cho thấy đường đi ngắn dần.", "Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu."],
    paragraphs: [
      "Tác tử nhận quan sát từ môi trường, cập nhật trạng thái nội bộ, lựa chọn hành động nhằm đạt mục tiêu rồi nhận phản hồi mới. Môi trường có thể là ứng dụng, người dùng hoặc mô phỏng; hành động có thể là gọi công cụ, hỏi thêm thông tin hay trả lời.",
      "Tác tử không nhất thiết là LLM. Một tác tử luật vẫn có thể nhận cảm nhận, trạng thái và hành động trong phạm vi xác định."
    ],
    diagram: { nodes: ["Môi trường", "Quan sát", "Trạng thái + quyết định", "Hành động", "Phản hồi"], caption: "Vòng lặp tác tử: quan sát, quyết định, hành động." }
  },
  {
    id: 30, group: "agents", title: "Kiến trúc chung của một tác tử",
    prompt: "Describe an Intelligent Agent’s input, internal processing, knowledge, decision mechanism, and output.",
    keywords: ["Đầu vào", "trạng thái", "bộ nhớ/tri thức", "cơ chế quyết định", "đầu ra", "timeout"],
    assignments: ["Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu.", "Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Đầu vào là quan sát/sự kiện; bộ xử lý chuẩn hóa và cập nhật trạng thái; bộ nhớ/tri thức cung cấp thông tin; cơ chế quyết định (luật, planner, policy hoặc LLM có tool) chọn hành động; đầu ra là câu trả lời hay lệnh gọi công cụ.",
      "Một thiết kế tốt có hợp đồng vào/ra rõ, timeout, lỗi có cấu trúc và lý do/nguồn khi cần kiểm toán. Sau hành động, tác tử quan sát kết quả để xác định bước tiếp theo."
    ]
  },
  {
    id: 31, group: "agents", title: "Hệ một tác tử và MAS",
    prompt: "Distinguish a single-agent system from a Multi-Agent System and describe tasks suited to cooperation.",
    keywords: ["Hệ một tác tử", "MAS", "modularity", "độ trễ"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Hệ một tác tử giao toàn bộ việc cho một thành phần; MAS chia việc giữa nhiều tác tử có trách nhiệm và giao tiếp xác định. MAS hữu ích khi bài toán có các năng lực tách biệt, có thể phát triển/đánh giá riêng như kiểm dữ liệu, dự đoán, truy xuất bằng chứng và tạo giải thích.",
      "Đổi lại, MAS tăng độ trễ, chi phí điều phối và lỗi giao diện. Nên chọn nhiều tác tử khi lợi ích modularity, khả năng kiểm soát hoặc song song hóa lớn hơn chi phí đó."
    ]
  },
  {
    id: 32, group: "agents", title: "Kiến trúc MAS",
    prompt: "Explain agent roles, communication, coordination, cooperation, and task allocation in a MAS.",
    keywords: ["nhiệm vụ", "thông điệp", "Bộ điều phối", "song song"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Bắt đầu bằng mục tiêu tổng thể, chia thành nhiệm vụ và gán cho tác tử theo năng lực. Các tác tử trao đổi thông điệp có id, trạng thái, payload, bằng chứng và phiên bản. Bộ điều phối quyết định thứ tự, xử lý phụ thuộc, deadline và khi nào tổng hợp kết quả.",
      "Cần nêu rõ đầu ra nào là dữ liệu, dự đoán hay bằng chứng; không trộn chúng thành một kết luận không truy vết. Có thể chạy song song các tác vụ độc lập."
    ],
    diagram: { nodes: ["Yêu cầu", "Điều phối", "Tác tử dữ liệu", "Tác tử dự đoán / tri thức", "Tổng hợp"], caption: "Mẫu điều phối trung tâm cho các tác vụ chuyên trách." }
  },
  {
    id: 33, group: "agents", title: "Tập trung, phân tán và phân cấp",
    prompt: "Compare centralized, decentralized, and hierarchical MAS architectures.",
    keywords: ["Tập trung", "Phân tán", "Phân cấp", "coordinator", "điểm lỗi đơn"],
    paragraphs: [
      "Tập trung có một coordinator, dễ kiểm soát luồng và tổng hợp nhưng dễ thành nút nghẽn/điểm lỗi đơn. Phân tán cho các tác tử tự thương lượng, bền hơn trước lỗi cục bộ nhưng khó đồng thuận và kiểm toán. Phân cấp chia coordinator theo nhóm, cân bằng mở rộng với khả năng kiểm soát nhưng thêm tầng giao tiếp."
    ],
    table: { headers: ["Kiến trúc", "Ưu thế", "Đánh đổi"], rows: [["Tập trung", "Luồng rõ, dễ kiểm soát", "Nút nghẽn và điểm lỗi đơn"], ["Phân tán", "Tự chủ, bớt phụ thuộc trung tâm", "Khó đồng thuận/quan sát"], ["Phân cấp", "Mở rộng theo nhóm", "Tốn điều phối giữa các tầng"]] }
  },
  {
    id: 34, group: "agents", title: "Giao tiếp và chia sẻ thông tin",
    prompt: "How do agents exchange information through messages, shared knowledge, and task delegation?",
    keywords: ["message-based", "Shared state", "Task delegation", "evidence", "version"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Giao tiếp message-based gửi yêu cầu/kết quả theo schema có định danh, agent, status, payload, evidence và version. Shared state cho phép node đọc cùng ngữ cảnh; cần quy tắc ai được ghi trường nào để tránh ghi đè không nhất quán. Task delegation chuyển một tác vụ cụ thể cùng deadline và điều kiện hoàn tất.",
      "Thông điệp lỗi phải nêu lỗi có thể phục hồi hay không. Không gửi nhiều thông tin sức khỏe hơn mức agent cần."
    ],
    code: "{\n  \"request_id\": \"req_001\",\n  \"agent\": \"DiabetesPredictionAgent\",\n  \"status\": \"ok\",\n  \"payload\": { \"prediction\": 1 },\n  \"evidence\": [],\n  \"model_version\": \"diabetes_dl_v1\"\n}"
  },
  {
    id: 35, group: "agents", title: "Reinforcement Learning",
    prompt: "Explain state, action, reward, policy, and environment in Reinforcement Learning.",
    keywords: ["RL", "trạng thái", "hành động", "policy", "reward", "khám phá và khai thác"],
    assignments: ["Agent02 (notebook): Q-learning mê cung — bước −1, đâm tường −10, tới đích +50; khám phá ε-greedy; trung bình trượt 100 episode cho thấy đường đi ngắn dần.", "Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu."],
    paragraphs: [
      "Trong RL, agent quan sát trạng thái, chọn hành động theo policy, môi trường chuyển sang trạng thái mới và trả reward. Qua tương tác, agent học policy tối đa hóa tổng reward dài hạn, cân bằng khám phá và khai thác.",
      "Trong bài toán y tế, reward/action phải được thiết kế an toàn. Đồ án mô tả RL như phần mở rộng mô phỏng; không dùng policy học được để tự kê thuốc hay điều khiển chăm sóc bệnh nhân."
    ],
    formula: "π(a|s): xác suất chọn hành động a khi ở trạng thái s"
  },
  {
    id: 36, group: "agents", title: "Markov Decision Process",
    prompt: "Describe an MDP: state/action spaces, transition probability, reward, and policy.",
    keywords: ["MDP", "Tính Markov", "xác suất chuyển", "chiết khấu", "Policy"],
    assignments: ["Agent02 (notebook): Q-learning mê cung — bước −1, đâm tường −10, tới đích +50; khám phá ε-greedy; trung bình trượt 100 episode cho thấy đường đi ngắn dần.", "Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu."],
    paragraphs: [
      "MDP mô hình hóa bài toán quyết định tuần tự bằng trạng thái S, hành động A, xác suất chuyển P(s′|s,a), phần thưởng R và hệ số chiết khấu γ. Tính Markov nghĩa là trạng thái hiện tại tóm tắt đủ thông tin để phân phối trạng thái tiếp theo không cần toàn bộ lịch sử.",
      "Policy π chọn hành động; mục tiêu thường tối đa hóa kỳ vọng tổng reward đã chiết khấu. Mô phỏng cho phép thử policy mà không tác động lên người thật."
    ],
    formula: "M = (S, A, P, R, γ),  Gₜ = Σₖ γᵏ rₜ₊ₖ"
  },
  {
    id: 37, group: "agents", title: "Tác tử AI và thành phần phần mềm truyền thống",
    prompt: "Compare an AI agent with a traditional software component: autonomy, goals, reasoning, tools, and interaction.",
    keywords: ["tự chủ", "mục tiêu", "trạng thái", "công cụ", "rule-based"],
    assignments: ["Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu."],
    paragraphs: [
      "Thành phần phần mềm truyền thống thường thực thi hàm/luồng được xác định trước. Tác tử có mục tiêu, duy trì trạng thái, chọn bước theo quan sát, có thể suy luận xác suất và gọi công cụ hoặc tác tử khác.",
      "Khác biệt là mức tự chủ, không phải ranh giới tuyệt đối: một agent vẫn cần code, schema và giới hạn quyền rõ như phần mềm thường; một module rule-based có thể được đóng gói thành agent."
    ]
  },
  {
    id: 38, group: "agents", title: "Thách thức khi phát triển MAS",
    prompt: "Discuss MAS challenges: coordination, communication, conflicting decisions, reliability, security, and evaluation.",
    keywords: ["timeout", "fallback", "request id", "phân quyền công cụ", "end-to-end"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11.", "A8 / Chap 5: vector + mở rộng đồ thị trả lời 25/26 câu, 97,9% phát biểu có nguồn hỗ trợ, 4/4 câu ngoài phạm vi bị từ chối; cổng trích dẫn phải chuẩn hóa [[S5]] / [[1, 3]] của gemma-4."],
    paragraphs: [
      "Thách thức gồm phụ thuộc giữa nhiệm vụ, schema thông điệp thay đổi, tác tử bất đồng, timeout/retry gây lặp hành động, và khó quy lỗi khi đầu ra qua nhiều bước. LLM còn có thể trả sai định dạng hoặc sinh thông tin không được nguồn hỗ trợ.",
      "Giảm rủi ro bằng interface/version rõ, timeout và fallback hữu hạn, log theo request id, phân quyền công cụ, kiểm tra đầu vào/đầu ra và tập đánh giá theo từng năng lực lẫn end-to-end. Đo cả chất lượng, độ trễ, chi phí và tỉ lệ lỗi."
    ]
  },
  {
    id: 39, group: "project", title: "Ứng dụng dự đoán tiểu đường",
    prompt: "Explain your diabetes prediction application: dataset, inputs, target, Deep Learning architecture, and output.",
    keywords: ["BRFSS 2015 và 2023", "686.019", "19 đặc trưng", "CNN-1D", "LSTM", "macro-F1", "22.027"],
    assignments: ["Tiểu luận Chap 1–4: BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng); status3 CNN-1D macro-F1 0,4309 ± 0,0018; Type 1/2 LSTM 0,5745 ± 0,0157 (3 seed); MLP của A8 chỉ 0,4264.", "A4: accuracy test MNIST 0,984 · CIFAR-10 0,676–0,678 · Diabetes 0,837 (macro-F1 ≈ 0,586); ba bản lệch nhau ≤ 0,15 điểm %; scratch chậm 7–10× trên ảnh.", "A2 (ba ứng dụng Kaggle): Diabetes BRFSS 253.680 dòng → Random Forest (F1 0,4886, ROC-AUC 0,8124); USA Real Estate 2,2 triệu dòng → HistGradientBoosting (R² 0,6654 trên USD); E-commerce CSAT → Logistic Regression + TF-IDF."],
    paragraphs: [
      "Dự án gộp khảo sát BRFSS 2015 và 2023; tập status3 có 686.019 dòng, nhãn tự báo cáo gồm không báo cáo mắc bệnh, tiền tiểu đường và đã được thông báo mắc tiểu đường. Mô hình nhận 19 đặc trưng khảo sát như huyết áp/cholesterol cao, BMI, vận động, sức khỏe tự đánh giá, giới tính, nhóm tuổi, học vấn và thu nhập.",
      "Status3 dùng CNN-1D được chọn theo macro-F1 validation; tác vụ 2 lớp Type 1/Type 2 trên 22.027 dòng đã chẩn đoán dùng LSTM. Đầu ra là nhãn và xác suất thống kê. Nhãn khảo sát không thay chẩn đoán y khoa."
    ],
    table: { headers: ["Tác vụ", "Nhãn / mẫu", "Mô hình hiện lưu"], rows: [["status3", "3 nhóm; 686.019 hồ sơ", "CNN-1D"], ["diabtype", "Type 1 / Type 2; 22.027 hồ sơ đã chẩn đoán", "LSTM"], ["Đầu ra", "Nhãn + phân phối xác suất", "Ước lượng khảo sát, không phải chẩn đoán"]] },
    sources: ["chap6-agents/README.md", "chap6-agents/backend/app/classify.py", "chap6-agents/models/*/preprocess.json"]
  },
  {
    id: 40, group: "project", title: "Luồng giao diện đến dịch vụ dự đoán",
    prompt: "How was the diabetes prediction application built and deployed? Explain UI, backend, model, and prediction service.",
    keywords: ["Next.js 16", "FastAPI", "LangGraph", "PyTorch", "SSE", "Docker Compose"],
    assignments: ["A2: FastAPI + web + mobile, Swagger /docs, 4 artifact joblib; GET /health trả model_source ('stub' khi thiếu artifact) — tách rõ huấn luyện và suy luận.", "ass_00 (Chương 12): KNN Pima (Glucose, BMI, Age) lưu joblib, phục vụ bằng Flask app.py + Streamlit + client.py — ví dụ triển khai tối giản."],
    paragraphs: [
      "Frontend Next.js 16 gửi câu hỏi tới API cùng mã hội thoại qua route proxy. Backend FastAPI điều phối đồ thị LangGraph; node intake trích xuất/kiểm tra thông tin, node risk gọi PyTorch model, rồi node tư vấn và cổng an toàn xử lý câu trả lời. Kết quả đi về giao diện theo SSE cùng vết chạy agent.",
      "Mã dự án có Docker Compose để chạy API và web ở các cổng riêng. Bản demo chạy tại chatbot.drakefamtax.id.vn: API cổng 8200 và web Next.js bản build cổng 3200 do launchd giữ, public qua Cloudflare tunnel, có watchdog deploy.sh heal; đây là demo của nhóm, không phải hạ tầng production có SLA."
    ],
    diagram: { nodes: ["Trình duyệt Next.js", "API / SSE", "LangGraph", "Model + Neo4j/RAG", "Kết quả + vết"], caption: "Đường đi thực tế của request trong ứng dụng." },
    sources: ["chap6-agents/frontend/src/app/api/chat/stream/route.ts", "chap6-agents/backend/app/main.py", "chap6-agents/DEPLOY.md"]
  },
  {
    id: 41, group: "project", title: "So sánh ba ứng dụng dự đoán",
    prompt: "Compare the diabetes, stock-price, and house-price applications by data, objective, output, and metrics.",
    keywords: ["phân loại", "chuỗi thời gian", "hồi quy", "accuracy", "RMSE", "Macro-F1", "R²"],
    assignments: ["A1 (giá nhà Việt Nam 2024, hồi quy): Gradient Boosting tốt nhất — MAE 1,20 tỷ, RMSE 1,92 tỷ, R² 0,914, MAPE 11,1%; baseline median có R² −0,05; mô hình đóng gói thành app Android VNHousingML.", "A2 (ba ứng dụng Kaggle): Diabetes BRFSS 253.680 dòng → Random Forest (F1 0,4886, ROC-AUC 0,8124); USA Real Estate 2,2 triệu dòng → HistGradientBoosting (R² 0,6654 trên USD); E-commerce CSAT → Logistic Regression + TF-IDF.", "A7 cổ phiếu FPT (30 phiên → giá phiên sau): RNN và LSTM đều RMSE lợi suất ≈ 1,92%, đoán đúng chiều chỉ 0,47–0,50 ≈ tung đồng xu — LSTM không thắng trên chuỗi giá nhiễu.", "A6 (RNN, Retailrocket): 24 giờ → số giao dịch giờ kế tiếp, chia theo thời gian 70/15/15; MAE baseline 4,44 · RNN NumPy scratch (BPTT viết tay) 2,96 · Keras SimpleRNN 2,56 · PyTorch nn.RNN 2,52."],
    paragraphs: [
      "Ba ứng dụng có cấu trúc dữ liệu và hàm mất mát khác nhau. Diabetes trong đồ án là phân loại từ đặc trưng khảo sát tĩnh; cổ phiếu thường là dự báo chuỗi thời gian; giá nhà là hồi quy từ thuộc tính bất động sản. Không so trực tiếp accuracy với RMSE vì chúng đo mục tiêu khác nhau."
    ],
    table: { headers: ["Ứng dụng", "Đầu vào", "Đầu ra", "Đánh giá phù hợp"], rows: [["Diabetes", "Đặc trưng khảo sát", "Nhóm/xác suất", "Macro-F1, recall theo lớp, calibration"], ["Stock", "Lịch sử giá/khối lượng", "Giá hoặc lợi suất tương lai", "MAE/RMSE, backtest theo thời gian"], ["House price", "Diện tích, vị trí, thuộc tính", "Giá liên tục", "MAE/RMSE, R²"]] },
    projectNote: "Số liệu thật: nhà ở lấy từ A1/A2, cổ phiếu FPT từ A7 (xem khung Liên hệ bài tập); không suy ra chúng từ code Diabeque."
  },
  {
    id: 42, group: "project", title: "Trace một mẫu đến kết quả",
    prompt: "Demonstrate a new sample through a deployed Deep Learning application, from user input to prediction.",
    keywords: ["median", "chuẩn hóa", "softmax", "safety-in", "intake", "risk node", "vết agent"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Ví dụ nhập hồ sơ khảo sát vào trang phân loại: frontend kiểm trường và gửi JSON tới FastAPI; backend xác thực miền giá trị, điền median cho đặc trưng thiếu, chuẩn hóa theo thống kê train, chạy model trên CPU và chuyển softmax thành nhãn/xác suất. Giao diện hiển thị kết quả cùng giới hạn của nó.",
      "Trong chat Diabeque, user nói tự nhiên nên thêm các bước safety-in, điều phối ý định và intake; nếu thiếu trường bắt buộc, agent hỏi tiếp trước khi risk node chạy. Có thể mở panel vết agent để chứng minh mỗi bước thay vì chỉ nêu đầu ra."
    ],
    points: ["Kiểm tra thứ tự 19 feature và preprocessing đi kèm model.", "Không bịa xác suất khi chưa thực sự chạy mẫu."]
  },
  {
    id: 43, group: "project", title: "Kiến trúc tổng thể của đồ án",
    prompt: "Present your Multi-Agent Development for Diabetes architecture and explain why a MAS was chosen.",
    keywords: ["LangGraph", "Rule-Based Agent", "Monitoring", "request_id", "aggregate", "RL agent"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11.", "Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu."],
    paragraphs: [
      "Bản triển khai hiện tại gồm UI Next.js, API FastAPI, đồ thị LangGraph với state chung, hai mô hình PyTorch và kho Neo4j/RAG. Luồng tách kiểm an toàn, điều phối, intake, dự đoán DL, luật sàng lọc, tri thức, tư vấn, kiểm an toàn đầu ra và giám sát.",
      "Tài liệu architecture PDF là thiết kế hybrid mở rộng với 8 vai trò: Data, DL, Rule, KG/RAG, Coordinator, Explanation, Monitoring và RL tùy chọn. Bản code đã có node rules (Rule-Based Agent: luật ADA 2025 tường minh, cờ rà soát khi luật và mô hình lệch nhau), node audit (Monitoring: ghi results/audit.jsonl, thống kê ở /api/v1/audit), coordinator sinh request_id và hàm aggregate tách dự đoán / luật / bằng chứng, và mỗi bước mang hợp đồng thông điệp (request_id, status, version, evidence). Data Agent là intake; Explanation là advisor. RL agent vẫn là phần mở rộng tùy chọn, chưa cài đặt."
    ],
    diagram: { nodes: ["UI / API", "Safety-in", "Coordinator", "Nhánh: Intake → Risk → Rules → Advisor hoặc Knowledge", "Safety-out", "Audit"], caption: "Sơ đồ rút gọn của graph hiện tại; knowledge đi thẳng tới safety-out, mọi lượt kết thúc ở audit. Model và Neo4j là dịch vụ được node gọi." },
    sources: ["chap6-agents/backend/app/agents/graph.py", "chap6-agents/backend/app/agents/nodes.py", "project_architecture_multiagent_diabet_v1.pdf", "/app/kien-truc"]
  },
  {
    id: 44, group: "project", title: "Vai trò từng agent trong code",
    prompt: "Identify the agents in your diabetes MAS; explain each responsibility, input, output, and interactions.",
    keywords: ["chín node", "SessionState", "request_id", "status", "version", "evidence"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Graph đang chạy có chín node. Hai node safety bao quanh luồng; coordinator phân loại intent, sinh request_id và chọn nhánh; audit ghi nhật ký cuối mỗi lượt. Các node chia sẻ SessionState; mỗi bước thêm summary, thời gian, tool call, tham chiếu code, status (ok/fallback), version và evidence vào trace."
    ],
    table: { headers: ["Node", "Nhiệm vụ / dữ liệu trao đổi"], rows: [["safety_in", "Message → chặn tình huống khẩn cấp hoặc cho đi tiếp"], ["orchestrator", "Message + history → knowledge / assess_risk / greeting / out_of_scope"], ["intake", "Message → trích xuất profile, kiểm tra và hỏi tối đa 3 trường mỗi lượt"], ["risk", "Profile → dự đoán status3 hoặc diabtype, kèm model_version"], ["rules", "Profile + dự đoán + HbA1c/đường huyết đói người dùng nhập → luật kích hoạt và cờ rà soát"], ["knowledge", "Question → đoạn tài liệu + citation"], ["advisor", "Risk/profile + evidence → lời khuyên có nguồn"], ["safety_out", "Sections/citations → lọc nội dung không an toàn trước khi trả"], ["audit", "Trace của lượt → bản ghi results/audit.jsonl (không lưu nội dung tin nhắn)"]] },
    sources: ["chap6-agents/backend/app/agents/graph.py", "chap6-agents/backend/app/agents/state.py"]
  },
  {
    id: 45, group: "project", title: "Tích hợp mô hình Deep Learning",
    prompt: "How is the diabetes DL model integrated, which agent calls it, and how is the result shared?",
    keywords: ["predict_diabetes_risk", "predict_diabetes_type", "SessionState", "temperature"],
    assignments: ["Tiểu luận Chap 1–4: BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng); status3 CNN-1D macro-F1 0,4309 ± 0,0018; Type 1/2 LSTM 0,5745 ± 0,0157 (3 seed); MLP của A8 chỉ 0,4264."],
    paragraphs: [
      "Node risk trong LangGraph gọi predict_diabetes_risk nếu người dùng chưa được ghi nhận là đã chẩn đoán; nếu đã chẩn đoán, nó gọi predict_diabetes_type. Các hàm dùng model đã lưu cùng danh sách feature, median, mean, độ lệch chuẩn và temperature.",
      "Kết quả risk được ghi vào SessionState và chuyển cho advisor để tạo giải thích. UI nhận section nguy cơ cùng nhãn, xác suất và trace. Mô hình không tự cập nhật từ hội thoại."
    ],
    formula: "risk(state) → predict_diabetes_risk(profile) hoặc predict_diabetes_type(profile)",
    sources: ["chap6-agents/backend/app/agents/nodes.py", "chap6-agents/backend/app/agents/tools.py", "chap6-agents/backend/app/classify.py"]
  },
  {
    id: 46, group: "project", title: "Knowledge Graph và truy vấn Cypher",
    prompt: "Explain the Neo4j KG in your project and demonstrate a Cypher query used by the system.",
    keywords: ["Disease", "SUPPORTED_BY", "Document/Chunk", "vector index", "SurveyRecord"],
    assignments: ["A8 / Chap 5: 35 nguồn trong sources.yaml → Document/Chunk, nhúng bge-m3 1024 chiều, KB tên KB_diabet trong Neo4j 5; dữ kiện y tế trích bằng LLM có kiểm câu trích (SUPPORTED_BY.quote)."],
    paragraphs: [
      "KG lưu Disease cùng Symptom, Complication, RiskFactor, Recommendation và DrugClass; tài liệu được chia thành Document/Chunk, các fact liên kết SUPPORTED_BY tới chunk. Nhánh survey có SurveyRecord/SurveyStatus. Truy xuất dùng vector index trên Chunk và nối lại tài liệu để trả URL nguồn.",
      "Ví dụ dưới đây minh họa pattern trong schema. Nó đọc yếu tố nguy cơ và nguồn hỗ trợ; đây không phải câu Cypher duy nhất được API gọi cho mọi câu hỏi."
    ],
    code: "MATCH (d:Disease {id: $disease})-[:HAS_RISK_FACTOR]->(f:RiskFactor)\nMATCH (f)-[:SUPPORTED_BY]->(c:Chunk)-[:PART_OF]->(doc:Document)\nRETURN f.name_vi, c.text, doc.title, doc.url\nLIMIT 10",
    sources: ["neo4j/cypher/00_schema.cypher", "neo4j/cypher/20_facts.cypher", "chap6-agents/backend/app/retrieval.py"]
  },
  {
    id: 47, group: "project", title: "RAG, trích dẫn và hạn chế hallucination",
    prompt: "How does RAG retrieve and generate grounded answers, and how are unsupported responses reduced?",
    keywords: ["bge-m3", "vector index", "graph expansion", "Cổng kiểm tra trích dẫn", "BM25"],
    assignments: ["A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh.", "A8 / Chap 5: vector + mở rộng đồ thị trả lời 25/26 câu, 97,9% phát biểu có nguồn hỗ trợ, 4/4 câu ngoài phạm vi bị từ chối; cổng trích dẫn phải chuẩn hóa [[S5]] / [[1, 3]] của gemma-4."],
    paragraphs: [
      "Question được nhúng bằng BAAI/bge-m3; vector index Neo4j tìm các chunk gần nhất, graph expansion bổ sung chunk liên quan. Backend gửi tối đa năm kết quả chính với metadata/URL cho answer generator. Cổng kiểm tra trích dẫn loại câu không có nguồn; ngưỡng tương đồng cũng có thể trả ngoài phạm vi.",
      "Trong implementation, vector là nhánh xếp hạng mặc định; BM25 và graph ranker có sẵn nhưng không bật mặc định. Citation gate giảm câu thiếu căn cứ nhưng không chứng minh mọi diễn giải đều đúng; cần kiểm tra người và đánh giá chất lượng retrieval riêng."
    ],
    sources: ["chap6-agents/backend/app/retrieval.py", "chap6-agents/backend/app/answer.py", "chap5-rag/pipeline/sources.yaml"]
  },
  {
    id: 48, group: "project", title: "Luồng chạy đầy đủ của MAS",
    prompt: "Trace the execution flow when a user asks a diabetes question, including coordinator, prediction, retrieval, and response.",
    keywords: ["safety_in", "orchestrator", "intake", "risk", "rules", "advisor", "knowledge", "safety_out", "audit"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Mọi lượt vào safety_in. Nếu phát hiện tình huống khẩn cấp, luồng trả cảnh báo và dừng. Nếu bình thường, orchestrator chọn intent: câu hỏi kiến thức đi knowledge; yêu cầu ước lượng nguy cơ đi intake, rồi khi đủ trường mới tới risk, rules và advisor. Knowledge trả answer có trích dẫn; greeting/ngoài phạm vi trả nội dung giới hạn.",
      "Các nhánh hội tụ ở safety_out để kiểm liều thuốc, kết luận chẩn đoán và trích dẫn, rồi audit ghi nhật ký và SSE kết thúc. Đây là flow của code hiện có; chỉ RL agent trong PDF vẫn là phần mở rộng chưa cài đặt."
    ],
    diagram: { nodes: ["Yêu cầu", "Safety-in", "Điều phối", "Intake → Risk → Rules → Advisor hoặc Knowledge", "Safety-out", "Audit", "SSE"], caption: "Nhánh kiến thức bỏ qua intake/advisor; cả hai nhánh đều qua safety-out trước khi trả SSE." },
    sources: ["chap6-agents/backend/app/agents/graph.py", "chap6-agents/backend/app/main.py", "/app/kien-truc"]
  },
  {
    id: 49, group: "project", title: "Kịch bản demo thực tế",
    prompt: "Demonstrate the completed MAS with a realistic user scenario and explain each processing step.",
    keywords: ["nhóm BRFSS 7", "BMI 29,4", "HighBP=1", "trace"],
    assignments: ["Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Có thể dùng câu mẫu kiểm thử của dự án: “Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?” Intake ánh xạ tuổi vào nhóm BRFSS 7, giới tính nam thành 1, tính BMI 29,4 và ghi nhận HighBP=1. Các giá trị này cũng có trong bộ đánh giá extraction.",
      "Trợ lý hỏi các trường bắt buộc còn thiếu, rồi risk node chạy khi hồ sơ đủ, rules đối chiếu luật sàng lọc; advisor kết hợp kết quả với nguồn tri thức và safety_out kiểm trước khi hiển thị. Khi demo, mở trace để chỉ rõ output thật của lần chạy; không đọc một xác suất giả định như kết quả đo được."
    ],
    sources: ["chap6-agents/results/agent_eval.json", "chap6-agents/backend/app/agents/nodes.py", "DEMO_HOI_DAP.md"]
  },
  {
    id: 50, group: "project", title: "Đánh giá mô hình và MAS",
    prompt: "How do you evaluate the DL model, retrieval, response accuracy, coordination, latency, and reliability?",
    keywords: ["macro-F1", "ba seed", "CNN-1D", "LSTM", "Recall@k/MRR", "latency"],
    assignments: ["Tiểu luận Chap 1–4: BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng); status3 CNN-1D macro-F1 0,4309 ± 0,0018; Type 1/2 LSTM 0,5745 ± 0,0157 (3 seed); MLP của A8 chỉ 0,4264.", "A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh.", "A8 / Chap 5: vector + mở rộng đồ thị trả lời 25/26 câu, 97,9% phát biểu có nguồn hỗ trợ, 4/4 câu ngoài phạm vi bị từ chối; cổng trích dẫn phải chuẩn hóa [[S5]] / [[1, 3]] của gemma-4.", "Chap 6: agent_eval — intent 22/22, intake gộp LLM + regex 41/42 trường (LLM riêng 39/42, regex 35/42), safety 11/11."],
    paragraphs: [
      "Đồ án so MLP/CNN-1D/LSTM trên validation macro-F1 qua ba seed và báo test riêng. Status3 chọn CNN-1D: test macro-F1 0,4309 ± 0,0018, accuracy 0,648. Tác vụ Type 1/2 chọn LSTM: test macro-F1 0,5745 ± 0,0157, accuracy 0,807; đây là kết quả tập khảo sát, không phải mức chính xác chẩn đoán lâm sàng.",
      "Bộ agent hiện ghi intent 22/22, intake gộp đúng 41/42 trường (97,6%), safety 11/11 và hội thoại nguy cơ tới bước dự đoán 4/4. Đây là bộ nhỏ do nhóm viết. Retrieval đã đo Recall@k/MRR trên 26 truy vấn gán nhãn (chap5-rag/results/eval.json) và chấm từng phát biểu có được nguồn hỗ trợ; còn thiếu latency p50/p95 liên tục, tỉ lệ fallback, drift và bộ test lớn hơn."
    ],
    table: { headers: ["Phần", "Đo lường", "Kết quả hiện có"], rows: [["Mô hình", "Macro-F1, accuracy, theo seed", "status3 CNN-1D: F1 0,4309; diabtype LSTM: 0,5745"], ["Agent", "Intent, extraction, safety, flow", "22/22; 41/42; 11/11; 4/4"], ["Retrieval / câu trả lời", "Hit@5, MRR@10, claim support", "Vector Hit@5 1,000, MRR@10 0,792; 97,9% phát biểu có nguồn (26 câu)"], ["Vận hành", "Latency, lỗi, fallback, uptime", "Ghi trace; cần đo liên tục khi triển khai"]] },
    sources: ["chap6-agents/results/dl_compare.json", "chap6-agents/results/agent_eval.json", "chap6-agents/backend/app/agents/nodes.py"]
  },
  {
    id: 51, group: "project", title: "Giới hạn, rủi ro và hướng cải tiến",
    prompt: "Discuss system limitations and risks, and how to improve architecture, coordination, knowledge, security, and deployment.",
    keywords: ["tự báo cáo", "external validation", "median", "audit", "RL chỉ trong mô phỏng"],
    assignments: ["A7 cổ phiếu FPT (30 phiên → giá phiên sau): RNN và LSTM đều RMSE lợi suất ≈ 1,92%, đoán đúng chiều chỉ 0,47–0,50 ≈ tung đồng xu — LSTM không thắng trên chuỗi giá nhiễu.", "Agent02 lab: RL vs rule-based agent định giá (giảm giá theo cầu), 5.000 episode, α 0,1, γ 0,9, ε 0,2 → 0,02; reward đánh giá RL 35,13 vs luật 34,97 — RL chỉ nhỉnh khi môi trường đủ đơn giản để luật gần tối ưu.", "A8 / Chap 5: trên 26 câu, Vector Hit@5 1,000 · MRR@10 0,792; BM25 chỉ 0,846 / 0,613; gộp graph vào RRF làm MRR giảm nên graph chỉ dùng để mở rộng ngữ cảnh."],
    paragraphs: [
      "BRFSS là khảo sát tự báo cáo, nhãn không thay xét nghiệm; dữ liệu có thể lệch quần thể và thời điểm. Tập đánh giá agent nhỏ, chưa có chuyên gia y tế chấm đầu ra; dữ liệu thiếu được điền median và LLM có thể diễn giải sai nguồn. RAG phụ thuộc chất lượng/tính cập nhật tài liệu và độ sẵn sàng Neo4j/LLM.",
      "Cải tiến: đánh giá theo nhóm tuổi/giới và external validation; bổ sung chuyên gia rà nguồn, query set cho retrieval và bộ phản biện câu trả lời; quản lý phiên bản model/dữ liệu; timeout, cache, health checks, bảo mật API, tối thiểu hóa dữ liệu và audit. PDF đề xuất RL chỉ trong mô phỏng; cần giữ ranh giới này."
    ],
    points: ["Không gọi output là chẩn đoán.", "Không để RL tự kê đơn hoặc điều khiển chăm sóc thật.", "Ưu tiên con người xem xét kết quả không chắc chắn."]
  },
];
