const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { deliver } = require('../services/deliveryService.js');

// Biến cờ bảo vệ để tránh việc các vòng quét gối đầu lên nhau gây trùng lặp dữ liệu
let isProcessing = false;

/**
 * Hàm thực hiện quét database tìm các event mới hoặc event lỗi đã đến hạn gửi lại
 */
async function scanAndRetry() {
    // Nếu vòng quét trước vẫn đang chạy bận rộn, lượt này lập tức bỏ qua và tiếp tục ngủ
    if (isProcessing) {
        console.log('[Worker] Previous scan is still processing. Skipping this tick...');
        return;
    }

    isProcessing = true;
    console.log('[Worker] Scanning for events to process...');

    try {
        const now = new Date();

        const eventsToRetry = await prisma.event.findMany({
            where: {
                // Điều kiện 1: Trạng thái phải là 'pending' hoặc 'failed_retry'
                status: {
                    in: ['pending', 'failed_retry']
                },
                // Điều kiện 2: Event mới tinh (null) HOẶC event lỗi đã đến giờ hẹn gửi lại (<= hiện tại)
                OR: [
                    { nextAttemptAt: null },
                    { nextAttemptAt: { lte: now } }
                ]
            },
            // Giới hạn gom 50 dòng một lần để tránh làm sập bộ nhớ RAM của hệ thống
            take: 50,
            // Ưu tiên xếp hàng theo thời gian tạo, xử lý hàng tồn kho cũ trước
            orderBy: {
                createdAt: 'asc'
            }
        });

        console.log(`[Worker] Found ${eventsToRetry.length} event(s) requiring execution.`);

        // Nếu không tìm thấy dòng nào thỏa mãn, thoát sớm để mở khóa cờ
        if (eventsToRetry.length === 0) {
            return;
        }

        // Sử dụng Promise.all để kích hoạt gửi đồng thời cả tập dữ liệu nhằm tăng tốc độ hệ thống
        const deliveryPromises = eventsToRetry.map(async (event) => {
            try {
                await deliver(event);
            } catch (deliverError) {
                console.error(`[Worker] Critical error processing event ${event.id}:`, deliverError.message);
            }
        });

        // Đợi cho đến khi tất cả các tiến trình gửi hàng trong lượt này hoàn thành xong xuôi
        await Promise.all(deliveryPromises);

    } catch (error) {
        console.error('[Worker] Fatal error encountered during database scanning operations:', error);
    } finally {
        // Giải phóng chiếc chốt bảo vệ, cho phép lượt quét kế tiếp chạy bình thường
        isProcessing = false;
        console.log('[Worker] Execution cycle completed.');
    }
}

/**
 * Hàm khởi chạy bộ hẹn giờ chạy ngầm cho Worker
 * @param {number} intervalMs - Delay between execution cycles in milliseconds (Default: 5000ms)
 */
function startRetryWorker(intervalMs = 5000) {
    console.log(`[Worker] Background worker initialized successfully. Running every ${intervalMs / 1000}s.`);

    // Chạy lượt đầu tiên ngay lập tức khi ứng dụng vừa được bật lên
    scanAndRetry();

    // Thiết lập vòng lặp thời gian vô hạn
    setInterval(scanAndRetry, intervalMs);
}

module.exports = {
    startRetryWorker
};
