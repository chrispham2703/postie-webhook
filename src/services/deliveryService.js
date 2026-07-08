const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Hàm xử lý gửi Webhook Event đến hệ thống đích của khách hàng
 * @param {Object} event
 */
async function deliver(event) {
    const startTime = Date.now();
    let responseStatus = null;
    let responseBody = null;
    let isSuccess = false;

    try {
        // 1. Thực hiện gọi Fetch gửi POST sang địa chỉ của khách hàng
        const response = await fetch(event.targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Postie-Event-Id': event.id, // Gửi kèm ID để khách hàng dễ đối chiếu
            },
            // Nếu payload trong DB đang là String (JSON text), gửi thẳng. Nếu là Object thì JSON.stringify.
            body: JSON.stringify(event.payload),            // Tự động hủy kết nối nếu hệ thống bên kia treo quá 10 giây
            signal: AbortSignal.timeout(10000)
        });

        responseStatus = response.status;
        responseBody = await response.text();

        // 2. Kiểm tra nếu mã trạng thái trả về nằm trong khoảng 2xx (200 - 299)
        if (response.ok) {
            isSuccess = true;
        }
    } catch (error) {
        // Nếu lỗi mạng, sập nguồn hoặc timeout, ghi nhận lại thông tin lỗi
        responseBody = error.message;
        responseStatus = error.name === 'TimeoutError' ? 408 : 500;
    }

    const duration = Date.now() - startTime; // Tính số mili-giây xử lý

    // ==========================================
    // XỬ LÝ LOGIC SAU KHI CÓ KẾT QUẢ GỬI HÀNG
    // ==========================================
    if (isSuccess) {
        // TRƯỜNG HỢP THÀNH CÔNG: Cập nhật trạng thái Event thành 'delivered'
        await prisma.event.update({
            where: { id: event.id },
            data: { status: 'delivered' }
        });
    } else {
        // TRƯỜNG HỢP THẤT BẠI: Tính toán lượt thử lại và thời gian hẹn giờ tiếp theo
        const nextAttemptCount = (event.attemptCount || 0) + 1;

        // Tính toán độ trễ (delay) bằng giây dựa trên số lần lỗi
        const delayInSeconds = Math.pow(2, nextAttemptCount) * 10;
        const nextAttemptAt = new Date(Date.now() + delayInSeconds * 1000);

        // Cập nhật bảng Event chính sang trạng thái chờ thử lại
        await prisma.event.update({
            where: { id: event.id },
            data: {
                status: 'failed_retry',
                attemptCount: nextAttemptCount,
                nextAttemptAt: nextAttemptAt
            }
        });

        // Ghi thêm 1 dòng nhật ký dày cộp vào bảng lịch sử (deliveryAttempt) để làm bằng chứng
        const id = `att_${crypto.randomUUID()}`;
        await prisma.deliveryAttempt.create({
            data: {
                eventId: event.id,
                attemptNum: nextAttemptCount,
                statusCode: responseStatus,
                responseBody: responseBody,
                durationMs: duration,
                id,
            }
        });
    }
}

module.exports = {
    deliver
};
