export const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const filePath = path.join(__dirname, '../../uploads', fileId);

        // Kiểm tra file tồn tại
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false, 
                message: "File not found" 
            });
        }

        // Đọc file dưới dạng buffer
        const fileBuffer = await fs.promises.readFile(filePath);

        // Set headers phù hợp
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment');
        
        // Gửi dữ liệu dưới dạng buffer
        res.send(fileBuffer);

    } catch (error) {
        console.error("Error in downloadFile:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error downloading file" 
        });
    }
};