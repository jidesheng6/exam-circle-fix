// 圆圈修复工具 - JavaScript实现
// 全局变量
let cv;
let originalImage = null;
let grayImage = null;
let template = null;
let templateRect = null;
let isSelecting = false;
let startPoint = null;
let currentImage = null;
let currentZoom = 1.5;
let originalCanvasWidth = 0;
let originalCanvasHeight = 0;
let originalImageWidth = 0;
let originalImageHeight = 0;
let isEditMode = false;
let manualMarks = []; // 存储手动标记的圆圈位置
let currentRotationAngle = 0; // 当前旋转角度
let originalFileName = 'repaired_circles'; // 存储原始文件名（不含扩展名）
let rotatedImage = null; // 旋转后的图像
let hasPreviewedDetection = false; // 是否已进行过预览检测
let isManualSelecting = false; // 是否正在进行手动选择
let manualStartX = 0, manualStartY = 0; // 手动选择起始坐标
let detectionResults = []; // 存储预览检测的结果

// OpenCV.js加载完成回调
function onOpenCvReady() {
    console.log('onOpenCvReady called');
    
    // 确保cv对象可用
    if (typeof window.cv !== 'undefined' && window.cv) {
        cv = window.cv;
        console.log('cv object set successfully:', typeof cv);
    } else {
        console.error('window.cv is not available');
    }
}

// OpenCV.js加载错误处理
function onOpenCvError() {
    document.getElementById('loading').style.display = 'none';
    showStatus('OpenCV.js 加载失败！请检查网络连接或刷新页面重试。', 'error');
    console.error('OpenCV.js 加载失败');
}

// 页面加载完成后显示加载状态
window.addEventListener('load', function() {
    document.getElementById('loading').style.display = 'block';
    showStatus('正在加载 OpenCV.js...', 'info');
});

// 文件上传处理
document.getElementById('fileInput').addEventListener('change', handleFileSelect);

// 拖拽上传
const uploadSection = document.getElementById('uploadSection');
uploadSection.addEventListener('dragover', handleDragOver);
uploadSection.addEventListener('dragleave', handleDragLeave);
uploadSection.addEventListener('drop', handleDrop);

// 参数控制事件监听 - 移除自动检测功能
// 用户修改参数时不再自动重新查找圆圈，避免卡顿
// document.getElementById('thresholdValue').addEventListener('input', function() {
//     if (template && !document.getElementById('previewDetectionBtn').disabled) {
//         previewDetection();
//     }
// });

// document.getElementById('darkRatioValue').addEventListener('input', function() {
//     if (template && !document.getElementById('previewDetectionBtn').disabled) {
//         previewDetection();
//     }
// });

// 获取阈值参数的辅助函数
function getThresholdValue() {
    const percentValue = parseFloat(document.getElementById('thresholdValue').value);
    return percentValue / 100; // 转换为0-1之间的小数
}

function getDarkRatioValue() {
    const percentValue = parseFloat(document.getElementById('darkRatioValue').value);
    return percentValue / 100; // 转换为0-1之间的小数
}



function handleDragOver(e) {
    e.preventDefault();
    uploadSection.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showStatus('请选择有效的图片文件！', 'error');
        return;
    }
    
    // 保存原始文件名（不含扩展名）
    originalFileName = file.name.replace(/\.[^/.]+$/, '');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

function loadImage(imageSrc) {
    const img = new Image();
    img.onload = function() {
        try {
            // 使用新的主canvas显示图片
            const canvas = document.getElementById('mainCanvas');
            const ctx = canvas.getContext('2d');
            
            // 保存真正的原始图片尺寸
            originalImageWidth = img.width;
            originalImageHeight = img.height;
            
            // 保存原始图片尺寸用于100%缩放基准
            originalCanvasWidth = img.width;
            originalCanvasHeight = img.height;
            
            // 设置canvas为原始尺寸
            canvas.width = originalCanvasWidth;
            canvas.height = originalCanvasHeight;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // 设置默认150%缩放比例
    currentZoom = 1.5;
    canvas.style.transform = `scale(${currentZoom})`;
            
            // 重置所有状态变量，避免鼠标状态异常
            isSelecting = false;
            startPoint = null;
            isEditMode = false;
            isManualSelecting = false;
            isPositionEditMode = false;
            templateRect = null;
            
            // 转换为OpenCV Mat
            originalImage = cv.imread(canvas);
            grayImage = new cv.Mat();
            cv.cvtColor(originalImage, grayImage, cv.COLOR_RGBA2GRAY);
            
            // 隐藏上传区域，显示图片显示区域和控制面板
            document.getElementById('uploadSection').style.display = 'none';
            document.getElementById('imageDisplaySection').style.display = 'block';
            document.getElementById('rotationControlsInline').style.display = 'block';
            
            // 启用旋转按钮
            document.getElementById('autoRotateBtn').disabled = false;
            document.getElementById('rotateLeftBtn').disabled = false;
            document.getElementById('rotateRightBtn').disabled = false;
            
            // 更新缩放显示
            updateZoomDisplay();
            const zoomSlider = document.getElementById('zoomSlider');
            if (zoomSlider) {
                zoomSlider.value = currentZoom;
            }
            
            // 绑定鼠标事件到主canvas
            setupCanvasEvents(canvas);
            
            showStatus('图片加载成功！请在图片上框选一个干净的圆圈作为模板。', 'info');
            
        } catch (error) {
            console.error('图片处理错误:', error);
            showStatus('图片处理失败：' + error.message, 'error');
        }
    };
    img.src = imageSrc;
}

function setupCanvasEvents(canvas) {
    let isMouseDown = false;
    let startX, startY;
    
    canvas.addEventListener('mousedown', function(e) {
        const rect = canvas.getBoundingClientRect();
        // 考虑缩放比例计算实际坐标 - 需要相对于canvas原始尺寸
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // 定位编辑模式下的点击移除
        if (isPositionEditMode) {
            handlePositionEditClick(currentX, currentY);
            return;
        }
        
        // 在手动编辑模式下允许画框，否则已选择模板时返回
        if (template && !isEditMode) return;
        
        // 手动编辑模式下的画框开始
        if (isEditMode && template) {
            isManualSelecting = true;
            manualStartX = currentX;
            manualStartY = currentY;
            return;
        }
        
        // 普通模板选择模式
        isMouseDown = true;
        startX = currentX;
        startY = currentY;
        startPoint = {x: startX, y: startY};
    });
    
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        // 考虑缩放比例计算实际坐标 - 需要相对于canvas原始尺寸
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // 手动编辑模式下的画框选择
        if (isManualSelecting && isEditMode) {
            redrawCanvasWithSelection(canvas, manualStartX, manualStartY, currentX, currentY);
            return;
        }
        
        // 普通模板选择模式
        if (!isMouseDown || template) return;
        
        // 重绘图像和选择框
        redrawCanvasWithSelection(canvas, startX, startY, currentX, currentY);
    });
    
    canvas.addEventListener('mouseup', function(e) {
        const rect = canvas.getBoundingClientRect();
        const endX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const endY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // 手动编辑模式下的画框完成
        if (isManualSelecting && isEditMode) {
            isManualSelecting = false;
            
            const width = Math.abs(endX - manualStartX);
            const height = Math.abs(endY - manualStartY);
            
            if (width < 10 || height < 10) {
                showStatus('选择区域太小，请重新选择！', 'error');
                redrawWithMarks();
                return;
            }
            
            // 计算实际图像坐标
            const currentDisplayImage = rotatedImage || originalImage;
            const scaleX = currentDisplayImage.cols / canvas.width;
            const scaleY = currentDisplayImage.rows / canvas.height;
            
            const centerX = (Math.min(manualStartX, endX) + width / 2) * scaleX;
            const centerY = (Math.min(manualStartY, endY) + height / 2) * scaleY;
            const radius = Math.min(width, height) / 2 * Math.min(scaleX, scaleY);
            
            // 检查是否点击了现有标记进行删除
            if (!removeManualMark(centerX, centerY)) {
                addManualMark(centerX, centerY, radius);
                showStatus(`已添加手动标记 (${Math.round(centerX)}, ${Math.round(centerY)})`, 'success');
            } else {
                showStatus('已删除手动标记', 'info');
            }
            return;
        }
        

        
        // 普通模板选择模式
        if (!isMouseDown || template) return;
        
        isMouseDown = false;
        
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        if (width < 10 || height < 10) {
            showStatus('选择区域太小，请重新选择！', 'error');
            redrawOriginalCanvas(canvas);
            return;
        }
        
        // 计算实际图像坐标（使用当前显示的图像）
        const currentDisplayImage = rotatedImage || originalImage;
        const scaleX = currentDisplayImage.cols / canvas.width;
        const scaleY = currentDisplayImage.rows / canvas.height;
        
        const left = Math.min(startX, endX) * scaleX;
        const top = Math.min(startY, endY) * scaleY;
        const w = width * scaleX;
        const h = height * scaleY;
        
        // 提取模板（从当前显示的图像对应的灰度图）
        try {
            templateRect = new cv.Rect(left, top, w, h);
            
            // 使用当前图像对应的灰度图
            let currentGrayImage;
            if (rotatedImage) {
                currentGrayImage = new cv.Mat();
                cv.cvtColor(rotatedImage, currentGrayImage, cv.COLOR_RGBA2GRAY);
            } else {
                currentGrayImage = grayImage;
            }
            
            template = currentGrayImage.roi(templateRect);
            
            // 如果使用了旋转图像的灰度图，需要在使用完后清理
            if (rotatedImage && currentGrayImage !== grayImage) {
                // 注意：不要在这里删除currentGrayImage，因为template还在使用它的ROI
                // 将引用保存起来，在reset或新选择时清理
            }
            
            // 在canvas上绘制确认的选择框
            redrawCanvasWithConfirmedSelection(canvas, Math.min(startX, endX), Math.min(startY, endY), width, height);
            
            document.getElementById('previewDetectionBtn').disabled = false;
            document.getElementById('editModeBtn').disabled = false;
            document.getElementById('repairBtn').disabled = false;
            document.getElementById('clearSelectionBtn').disabled = false;
            showStatus(`模板已选定！区域大小: ${Math.round(w)}×${Math.round(h)}`, 'success');
            
        } catch (error) {
            console.error('模板提取错误:', error);
            showStatus('模板提取失败：' + error.message, 'error');
        }
    });
}

function redrawCanvasWithSelection(canvas, startX, startY, currentX, currentY) {
    const ctx = canvas.getContext('2d');
    
    // 重绘当前显示的图像（旋转后的图像或原图）
    const currentDisplayImage = rotatedImage || originalImage;
    cv.imshow(canvas, currentDisplayImage);
    
    // 绘制选择框 - 红色实线框
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
}

function redrawCanvasWithConfirmedSelection(canvas, x, y, width, height) {
    const ctx = canvas.getContext('2d');
    
    // 重绘当前显示的图像（旋转后的图像或原图）
    const currentDisplayImage = rotatedImage || originalImage;
    cv.imshow(canvas, currentDisplayImage);
    
    // 绘制确认的选择框 - 红色实线框
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
}

function redrawOriginalCanvas(canvas) {
    const currentDisplayImage = rotatedImage || originalImage;
    cv.imshow(canvas, currentDisplayImage);
}

function startRepair() {
    if (!template || !originalImage) {
        showStatus('请先选择模板！', 'error');
        return;
    }
    
    try {
        showStatus('正在修复图像，请稍候...', 'info');
        document.getElementById('repairBtn').disabled = true;
        
        // 显示进度条
        showProgress(0, '开始修复...');
        
        // 获取参数
        const threshold = getThresholdValue();
        const darkRatioThreshold = getDarkRatioValue();
        
        // 执行修复
        setTimeout(() => {
            performRepair(threshold, darkRatioThreshold);
        }, 100);
        
    } catch (error) {
        console.error('修复过程错误:', error);
        showStatus('修复失败：' + error.message, 'error');
        document.getElementById('repairBtn').disabled = false;
        hideProgress();
    }
}

function performRepair(threshold, darkRatioThreshold) {
    try {
        let locations = [];
        
        // 如果有预览检测结果，优先使用它们
        if (hasPreviewedDetection && detectionResults.length > 0) {
            updateProgress(10, '使用预览检测结果...');
            
            // 将检测结果转换为修复位置格式
            detectionResults.forEach(result => {
                locations.push({
                    x: result.x,
                    y: result.y,
                    value: 1.0,
                    fromDetection: true
                });
            });
            
            // 添加手动标记的位置
            manualMarks.forEach(mark => {
                const x = Math.max(0, mark.x - template.cols / 2);
                const y = Math.max(0, mark.y - template.rows / 2);
                
                const isDuplicate = locations.some(loc => 
                    Math.abs(loc.x - x) < template.cols / 2 && 
                    Math.abs(loc.y - y) < template.rows / 2
                );
                
                if (!isDuplicate) {
                    locations.push({x: x, y: y, value: 1.0, manual: true});
                }
            });
            
            console.log(`使用 ${detectionResults.length} 个预览检测结果和 ${manualMarks.length} 个手动标记`);
            updateProgress(40, '准备修复...');
        } else {
            // 如果没有预览检测结果，进行模板匹配
            updateProgress(10, '正在进行模板匹配...');
            
            const scales = [0.8, 0.9, 1.0, 1.1, 1.2];
            
            for (let scaleIndex = 0; scaleIndex < scales.length; scaleIndex++) {
                const scale = scales[scaleIndex];
                updateProgress(10 + (scaleIndex / scales.length) * 30, `模板匹配中... (${scaleIndex + 1}/${scales.length})`);
                let scaledTemplate = template;
                let needsCleanup = false;
                
                if (scale !== 1.0) {
                    scaledTemplate = new cv.Mat();
                    const newSize = new cv.Size(
                        Math.round(template.cols * scale),
                        Math.round(template.rows * scale)
                    );
                    cv.resize(template, scaledTemplate, newSize, 0, 0, cv.INTER_LINEAR);
                    needsCleanup = true;
                }
                
                const result = new cv.Mat();
                const mask = new cv.Mat();
                cv.matchTemplate(grayImage, scaledTemplate, result, cv.TM_CCOEFF_NORMED, mask);
                
                const data = result.data32F;
                for (let i = 0; i < result.rows; i++) {
                    for (let j = 0; j < result.cols; j++) {
                        const value = data[i * result.cols + j];
                        if (value >= threshold) {
                            const adjustedX = Math.round(j + (scaledTemplate.cols - template.cols) / 2);
                            const adjustedY = Math.round(i + (scaledTemplate.rows - template.rows) / 2);
                            
                            const minDistance = Math.max(template.cols, template.rows) * 0.3;
                            const isDuplicate = locations.some(loc => {
                                const distance = Math.sqrt(
                                    Math.pow(loc.x - adjustedX, 2) + Math.pow(loc.y - adjustedY, 2)
                                );
                                return distance < minDistance;
                            });
                            
                            if (!isDuplicate) {
                                locations.push({
                                    x: adjustedX, 
                                    y: adjustedY, 
                                    value: value,
                                    scale: scale
                                });
                            }
                        }
                    }
                }
                
                result.delete();
                mask.delete();
                if (needsCleanup) {
                    scaledTemplate.delete();
                }
            }
            
            locations.sort((a, b) => b.value - a.value);
            
            // 添加手动标记的位置
            manualMarks.forEach(mark => {
                const x = Math.max(0, mark.x - template.cols / 2);
                const y = Math.max(0, mark.y - template.rows / 2);
                
                const isDuplicate = locations.some(loc => 
                    Math.abs(loc.x - x) < template.cols / 2 && 
                    Math.abs(loc.y - y) < template.rows / 2
                );
                
                if (!isDuplicate) {
                    locations.push({x: x, y: y, value: 1.0, manual: true});
                }
            });
            
            console.log(`找到 ${locations.length} 个候选位置（包含 ${manualMarks.length} 个手动标记）`);
        }
        
        updateProgress(50, '开始修复圆圈...');
        
        // 创建修复后的图像 - 使用当前显示的图像（可能是旋转后的）
        const currentDisplayImage = rotatedImage || originalImage;
        const repairedImage = currentDisplayImage.clone();
        let repairCount = 0;
        
        // 检查每个位置是否需要修复
        for (let locIndex = 0; locIndex < locations.length; locIndex++) {
            const loc = locations[locIndex];
            updateProgress(50 + (locIndex / locations.length) * 40, `修复中... (${locIndex + 1}/${locations.length})`);
            const roi = grayImage.roi(new cv.Rect(loc.x, loc.y, template.cols, template.rows));
            
            if (isMarked(roi, darkRatioThreshold)) {
                // 简单直接的覆盖修复
                const templateBGR = new cv.Mat();
                cv.cvtColor(template, templateBGR, cv.COLOR_GRAY2RGBA);
                
                const roiRepair = repairedImage.roi(new cv.Rect(loc.x, loc.y, template.cols, template.rows));
                templateBGR.copyTo(roiRepair);
                roiRepair.delete();
                
                repairCount++;
                templateBGR.delete();
            }
            
            roi.delete();
        }
        
        // 显示结果到模态框
        const modalResultCanvas = document.getElementById('modalResultCanvas');
        if (rotatedImage) {
            modalResultCanvas.width = rotatedImage.cols;
            modalResultCanvas.height = rotatedImage.rows;
        } else {
            modalResultCanvas.width = originalImageWidth;
            modalResultCanvas.height = originalImageHeight;
        }
        
        cv.imshow('modalResultCanvas', repairedImage);
        
        // 更新修复数量
        document.getElementById('repairCount').textContent = repairCount;
        
        // 显示模态框
        document.getElementById('resultModal').style.display = 'flex';
        
        // 应用默认缩放
        setResultZoom(currentResultZoom);
        
        const downloadBtn = document.getElementById('modalDownloadBtn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
        updateProgress(100, '修复完成！');
        showStatus(`修复完成！共修复了 ${repairCount} 个被涂改的圆圈。`, 'success');
        
        // 隐藏进度条
        setTimeout(() => {
            hideProgress();
        }, 1000);
        
        // 清理内存
        repairedImage.delete();
        
    } catch (error) {
        console.error('修复执行错误:', error);
        showStatus('修复执行失败：' + error.message, 'error');
        hideProgress();
    } finally {
        document.getElementById('repairBtn').disabled = false;
    }
}

function isMarked(region, darkRatioThreshold) {
    try {
        // 统计深色像素比例
        const darkThresh = 180;
        const total = region.rows * region.cols;
        let darkCount = 0;
        
        const data = region.data;
        for (let i = 0; i < data.length; i++) {
            if (data[i] < darkThresh) {
                darkCount++;
            }
        }
        
        const darkRatio = darkCount / total;
        
        // 边缘检测
        const edges = new cv.Mat();
        cv.Canny(region, edges, 50, 150);
        
        let edgeCount = 0;
        const edgeData = edges.data;
        for (let i = 0; i < edgeData.length; i++) {
            if (edgeData[i] > 0) {
                edgeCount++;
            }
        }
        
        edges.delete();
        
        // 综合判断
        return darkRatio > darkRatioThreshold || edgeCount > 50;
        
    } catch (error) {
        console.error('标记检测错误:', error);
        return false;
    }
}

function downloadResult() {
    const canvas = document.getElementById('modalResultCanvas');
    const link = document.createElement('a');
    link.download = originalFileName + '_fix.png';
    link.href = canvas.toDataURL();
    link.click();
    
    showStatus('图片已下载！', 'success');
}

// 结果图片缩放功能
let currentResultZoom = 1.5; // 默认150%

function setResultZoom(zoomLevel) {
    currentResultZoom = zoomLevel;
    const canvas = document.getElementById('modalResultCanvas');
    const zoomDisplay = document.getElementById('resultZoomDisplay');
    
    if (canvas) {
        canvas.style.transform = `scale(${zoomLevel})`;
        canvas.style.transformOrigin = 'top left';
    }
    
    if (zoomDisplay) {
        zoomDisplay.textContent = Math.round(zoomLevel * 100) + '%';
    }
    
    // 更新按钮样式
    const buttons = document.querySelectorAll('.result-zoom-controls .btn');
    buttons.forEach(btn => {
        btn.style.background = '';
        btn.style.color = '';
    });
    
    // 高亮当前缩放按钮
    const targetZooms = [0.5, 1.0, 1.5, 2.0];
    const index = targetZooms.indexOf(zoomLevel);
    if (index !== -1 && buttons[index]) {
        buttons[index].style.background = '#2196F3';
        buttons[index].style.color = 'white';
    }
}

// 预览检测功能
function previewDetection() {
    if (!template || !originalImage || !grayImage) {
        showStatus('请先选择模板圆圈！', 'error');
        return;
    }
    
    const threshold = getThresholdValue();
    const darkRatioThreshold = getDarkRatioValue();
    
    try {
        // 使用当前显示的图像进行检测
        const currentDisplayImage = rotatedImage || originalImage;
        const currentGrayImage = new cv.Mat();
        cv.cvtColor(currentDisplayImage, currentGrayImage, cv.COLOR_RGBA2GRAY);
        
        // 多尺度模板匹配
        const locations = [];
        const scales = [0.8, 0.9, 1.0, 1.1, 1.2]; // 多个缩放比例
        
        for (const scale of scales) {
            let scaledTemplate = template;
            let needsCleanup = false;
            
            // 如果不是原始尺度，创建缩放后的模板
            if (scale !== 1.0) {
                scaledTemplate = new cv.Mat();
                const newSize = new cv.Size(
                    Math.round(template.cols * scale),
                    Math.round(template.rows * scale)
                );
                cv.resize(template, scaledTemplate, newSize, 0, 0, cv.INTER_LINEAR);
                needsCleanup = true;
            }
            
            // 执行模板匹配
            const result = new cv.Mat();
            const mask = new cv.Mat();
            cv.matchTemplate(currentGrayImage, scaledTemplate, result, cv.TM_CCOEFF_NORMED, mask);
            
            // 找到匹配位置
            const data = result.data32F;
            for (let i = 0; i < result.rows; i++) {
                for (let j = 0; j < result.cols; j++) {
                    const value = data[i * result.cols + j];
                    if (value >= threshold) {
                        // 调整坐标以适应原始模板尺寸
                        const adjustedX = Math.round(j + (scaledTemplate.cols - template.cols) / 2);
                        const adjustedY = Math.round(i + (scaledTemplate.rows - template.rows) / 2);
                        
                        // 去重：避免相邻重复匹配（使用更精确的距离计算）
                        const minDistance = Math.max(template.cols, template.rows) * 0.3;
                        const isDuplicate = locations.some(loc => {
                            const distance = Math.sqrt(
                                Math.pow(loc.x - adjustedX, 2) + Math.pow(loc.y - adjustedY, 2)
                            );
                            return distance < minDistance;
                        });
                        
                        if (!isDuplicate) {
                            locations.push({
                                x: adjustedX, 
                                y: adjustedY, 
                                value: value,
                                scale: scale
                            });
                        }
                    }
                }
            }
            
            // 清理内存
            result.delete();
            mask.delete();
            if (needsCleanup) {
                scaledTemplate.delete();
            }
        }
        
        // 按匹配度排序，保留最佳匹配
        locations.sort((a, b) => b.value - a.value);
        
        console.log(`找到 ${locations.length} 个候选位置`);
        
        // 保存检测结果
        detectionResults = [];
        let candidateCount = 0;
        let markedCount = 0;
        
        // 检查每个位置并保存结果
        for (const loc of locations) {
            const roi = currentGrayImage.roi(new cv.Rect(loc.x, loc.y, template.cols, template.rows));
            
            const rect = {
                x: loc.x,
                y: loc.y,
                width: template.cols,
                height: template.rows
            };
            
            if (isMarked(roi, darkRatioThreshold)) {
                // 待修复圆圈
                detectionResults.push({...rect, type: 'marked'});
                markedCount++;
            } else {
                // 候选圆圈
                detectionResults.push({...rect, type: 'candidate'});
                candidateCount++;
            }
            
            roi.delete();
        }
        
        // 重绘canvas显示检测结果
        redrawWithDetectionResults();
        
        showStatus(`检测完成！找到 ${candidateCount} 个候选圆圈，${markedCount} 个待修复圆圈`, 'success');
        
        // 设置预览检测完成标志
        hasPreviewedDetection = true;
        
        // 启用定位编辑按钮
        document.getElementById('positionEditBtn').disabled = false;
        
        // 清理资源
        currentGrayImage.delete();
        
    } catch (error) {
        console.error('预览检测错误:', error);
        showStatus('预览检测失败：' + error.message, 'error');
    }
}

// 清除选择功能
function clearSelection() {
    // 清理模板相关的OpenCV对象
    if (template) {
        template.delete();
        template = null;
    }
    
    // 重置选择相关变量
    templateRect = null;
    isSelecting = false;
    startPoint = null;
    
    // 重绘canvas，移除选择框
    const mainCanvas = document.getElementById('mainCanvas');
    if (mainCanvas && originalImage) {
        redrawOriginalCanvas(mainCanvas);
    }
    
    // 更新按钮状态
    document.getElementById('previewDetectionBtn').disabled = true;
    document.getElementById('editModeBtn').disabled = true;
    document.getElementById('repairBtn').disabled = true;
    document.getElementById('clearSelectionBtn').disabled = true;
    
    showStatus('已清除选择，请重新选择模板圆圈。', 'info');
}

// 切换编辑模式
function toggleEditMode() {
    // 检查是否已经进行过预览检测
    if (!isEditMode && (!template || manualMarks.length === 0 && !hasPreviewedDetection)) {
        showStatus('请先进行预览检测后再使用手动选择功能', 'error');
        return;
    }
    
    isEditMode = !isEditMode;
    const editBtn = document.getElementById('editModeBtn');
    
    if (isEditMode) {
        editBtn.textContent = '退出编辑';
        editBtn.style.backgroundColor = '#ff6b6b';
        
        // 禁用其他功能按钮
        document.getElementById('previewDetectionBtn').disabled = true;
        document.getElementById('repairBtn').disabled = true;
        document.getElementById('clearSelectionBtn').disabled = true;
        document.getElementById('autoRotateBtn').disabled = true;
        document.getElementById('rotateLeftBtn').disabled = true;
        document.getElementById('rotateRightBtn').disabled = true;
        document.getElementById('positionEditBtn').disabled = true;
        
        // 重绘显示检测结果和手动标记
        redrawWithMarks();
        
        showStatus('编辑模式已开启：拖拽画框标记需要修复的圆圈位置', 'info');
    } else {
        editBtn.textContent = '手动选择';
        editBtn.style.backgroundColor = '';
        
        // 重新启用其他功能按钮
        if (template) {
            document.getElementById('previewDetectionBtn').disabled = false;
            document.getElementById('repairBtn').disabled = false;
            document.getElementById('clearSelectionBtn').disabled = false;
            document.getElementById('positionEditBtn').disabled = false;
        }
        if (originalImage) {
            document.getElementById('autoRotateBtn').disabled = false;
            document.getElementById('rotateLeftBtn').disabled = false;
            document.getElementById('rotateRightBtn').disabled = false;
        }
        
        showStatus('编辑模式已关闭', 'info');
    }
}

// 定位编辑模式
let isPositionEditMode = false;

function togglePositionEditMode() {
    // 检查是否已经进行过预览检测
    if (!isPositionEditMode && (!template || (detectionResults.length === 0 && manualMarks.length === 0))) {
        showStatus('请先进行预览检测后再使用定位编辑功能', 'error');
        return;
    }
    
    isPositionEditMode = !isPositionEditMode;
    const positionEditBtn = document.getElementById('positionEditBtn');
    
    if (isPositionEditMode) {
        positionEditBtn.textContent = '退出定位编辑';
        positionEditBtn.style.backgroundColor = '#ff6b6b';
        
        // 禁用其他功能按钮
        document.getElementById('previewDetectionBtn').disabled = true;
        document.getElementById('editModeBtn').disabled = true;
        document.getElementById('repairBtn').disabled = true;
        document.getElementById('clearSelectionBtn').disabled = true;
        document.getElementById('autoRotateBtn').disabled = true;
        document.getElementById('rotateLeftBtn').disabled = true;
        document.getElementById('rotateRightBtn').disabled = true;
        
        // 重绘显示检测结果和手动标记
        redrawWithMarks();
        
        showStatus('定位编辑模式已开启：点击定位框可移除该定位框', 'info');
    } else {
        positionEditBtn.textContent = '定位编辑';
        positionEditBtn.style.backgroundColor = '';
        
        // 重新启用其他功能按钮
        if (template) {
            document.getElementById('previewDetectionBtn').disabled = false;
            document.getElementById('editModeBtn').disabled = false;
            document.getElementById('repairBtn').disabled = false;
            document.getElementById('clearSelectionBtn').disabled = false;
        }
        if (originalImage) {
            document.getElementById('autoRotateBtn').disabled = false;
            document.getElementById('rotateLeftBtn').disabled = false;
            document.getElementById('rotateRightBtn').disabled = false;
        }
        
        showStatus('定位编辑模式已关闭', 'info');
    }
}

// 处理定位编辑模式下的点击
function handlePositionEditClick(canvasX, canvasY) {
    // 计算实际图像坐标
    const currentDisplayImage = rotatedImage || originalImage;
    const scaleX = currentDisplayImage.cols / document.getElementById('mainCanvas').width;
    const scaleY = currentDisplayImage.rows / document.getElementById('mainCanvas').height;
    
    const imageX = canvasX * scaleX;
    const imageY = canvasY * scaleY;
    
    // 检查是否点击了检测结果中的某个圆圈
    for (let i = detectionResults.length - 1; i >= 0; i--) {
        const result = detectionResults[i];
        const centerX = result.x + result.width / 2;
        const centerY = result.y + result.height / 2;
        const radius = Math.max(result.width, result.height) / 2;
        const distance = Math.sqrt(Math.pow(imageX - centerX, 2) + Math.pow(imageY - centerY, 2));
        
        if (distance <= radius) {
            // 移除这个检测结果
            detectionResults.splice(i, 1);
            showStatus(`已移除定位框 (${Math.round(centerX)}, ${Math.round(centerY)})`, 'info');
            redrawWithMarks();
            return;
        }
    }
    
    // 检查是否点击了手动标记中的某个圆圈
    for (let i = manualMarks.length - 1; i >= 0; i--) {
        const mark = manualMarks[i];
        const distance = Math.sqrt(Math.pow(imageX - mark.x, 2) + Math.pow(imageY - mark.y, 2));
        
        if (distance <= mark.radius) {
            // 移除这个手动标记
            manualMarks.splice(i, 1);
            showStatus(`已移除手动标记 (${Math.round(mark.x)}, ${Math.round(mark.y)})`, 'info');
            redrawWithMarks();
            return;
        }
    }
    
    showStatus('未点击到任何定位框', 'warning');
}

// 添加手动标记
function addManualMark(x, y, radius) {
    const markRadius = radius || Math.max(10, template ? template.rows / 2 : 20); // 基于模板大小或传入半径设置标记半径
    manualMarks.push({ x: x, y: y, radius: markRadius });
    redrawWithMarks();
}

// 删除手动标记
function removeManualMark(x, y) {
    const threshold = 30; // 点击阈值
    for (let i = manualMarks.length - 1; i >= 0; i--) {
        const mark = manualMarks[i];
        const distance = Math.sqrt((x - mark.x) ** 2 + (y - mark.y) ** 2);
        if (distance <= threshold) {
            manualMarks.splice(i, 1);
            redrawWithMarks();
            return true;
        }
    }
    return false;
}

// 重绘图像并显示所有标记
function redrawWithDetectionResults() {
    if (!originalImage) return;
    
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    
    // 重绘当前显示的图像
    const currentDisplayImage = rotatedImage || originalImage;
    cv.imshow(canvas, currentDisplayImage);
    
    // 绘制检测结果
    detectionResults.forEach(result => {
        if (result.type === 'marked') {
            // 待修复圆圈 - 红色实线框
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
        } else {
            // 候选圆圈 - 蓝色虚线框
            ctx.strokeStyle = '#0000ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
        }
        ctx.strokeRect(result.x, result.y, result.width, result.height);
    });
    
    // 绘制手动标记（绿色矩形框，与模板选择框样式一致）
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    manualMarks.forEach(mark => {
        const halfWidth = mark.radius;
        const halfHeight = mark.radius;
        ctx.strokeRect(mark.x - halfWidth, mark.y - halfHeight, halfWidth * 2, halfHeight * 2);
    });
}

function redrawWithMarks() {
    redrawWithDetectionResults();
}

function reset() {
    // 清理OpenCV对象
    if (originalImage) originalImage.delete();
    if (grayImage) grayImage.delete();
    if (template) template.delete();
    if (rotatedImage) rotatedImage.delete();
    
    // 重置变量
    originalImage = null;
    grayImage = null;
    template = null;
    templateRect = null;
    rotatedImage = null;
    currentRotationAngle = 0;
    detectionResults = [];
    manualMarks = [];
    hasPreviewedDetection = false;
    isEditMode = false;
    isManualSelecting = false;
    
    // 重置UI
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('imageDisplaySection').style.display = 'none';
    document.getElementById('rotationControlsInline').style.display = 'none';
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('resultDisplay').style.display = 'none';
    document.getElementById('previewDetectionBtn').disabled = true;
    document.getElementById('editModeBtn').disabled = true;
    document.getElementById('repairBtn').disabled = true;
    const downloadBtn = document.getElementById('modalDownloadBtn');
        if (downloadBtn) {
            downloadBtn.disabled = true;
        }
    document.getElementById('clearSelectionBtn').disabled = true;
    document.getElementById('autoRotateBtn').disabled = true;
    document.getElementById('rotateLeftBtn').disabled = true;
    document.getElementById('rotateRightBtn').disabled = true;
    document.getElementById('status').style.display = 'none';
    
    // 重置编辑模式
    isEditMode = false;
    manualMarks = [];
    hasPreviewedDetection = false;
    isManualSelecting = false;
    const editBtn = document.getElementById('editModeBtn');
    editBtn.textContent = '手动选择';
    editBtn.style.backgroundColor = '';
    
    // 重置缩放状态
    currentZoom = 1.5;
    originalCanvasWidth = 0;
    originalCanvasHeight = 0;
    originalImageWidth = 0;
    originalImageHeight = 0;
    const mainCanvas = document.getElementById('mainCanvas');
    if (mainCanvas) {
        mainCanvas.style.transform = 'scale(1.5)';
    }
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
        zoomSlider.value = 1.5;
    }
    updateZoomDisplay();
    
    // 保存当前参数（除非是完全重置）
    if (!arguments[0]) { // 如果没有传入完全重置标志，则保存参数
        const currentThreshold = document.getElementById('thresholdValue').value;
        const currentDarkRatio = document.getElementById('darkRatioValue').value;
        
        // 重置后恢复参数
        setTimeout(() => {
            document.getElementById('thresholdValue').value = currentThreshold;
            document.getElementById('darkRatioValue').value = currentDarkRatio;
        }, 0);
    } else {
        // 完全重置时才恢复默认值
        document.getElementById('thresholdValue').value = 60;
        document.getElementById('darkRatioValue').value = 2;
    }
    

    
    showStatus('已重置，请重新选择图片。', 'info');
}

function resetAndSelectFile() {
    // 先重置所有状态
    reset();
    
    // 然后自动触发文件选择器
    document.getElementById('fileInput').click();
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
    
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// 错误处理
window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
    if (e.error && e.error.message) {
        showStatus('发生错误：' + e.error.message, 'error');
    } else {
        showStatus('发生未知错误', 'error');
    }
});

// OpenCV.js 加载错误处理
window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise 拒绝:', e.reason);
    if (e.reason) {
        showStatus('加载失败：' + e.reason, 'error');
    } else {
        showStatus('Promise 被拒绝', 'error');
    }
});

// 缩放功能相关函数
function setZoom(zoomLevel) {
    currentZoom = zoomLevel;
    applyZoom();
    updateZoomDisplay();
}

function applyZoom() {
    const canvas = document.getElementById('mainCanvas');
    if (canvas && originalCanvasWidth > 0 && originalCanvasHeight > 0) {
        canvas.style.transform = `scale(${currentZoom})`;
        
        // 更新滑块值
        const slider = document.getElementById('zoomSlider');
        if (slider) {
            slider.value = currentZoom;
        }
    }
}

function updateZoomDisplay() {
    const zoomValue = document.getElementById('zoomValue');
    if (zoomValue) {
        zoomValue.textContent = Math.round(currentZoom * 100) + '%';
    }
}

function fitToScreen() {
    const canvas = document.getElementById('mainCanvas');
    if (canvas && originalCanvasWidth > 0 && originalCanvasHeight > 0) {
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        // 计算适合容器的缩放比例
        const scaleX = (containerRect.width - 40) / originalCanvasWidth;
        const scaleY = (containerRect.height - 40) / originalCanvasHeight;
        const optimalZoom = Math.min(scaleX, scaleY, 3); // 最大不超过3倍
        
        setZoom(optimalZoom);
    }
}

// 图片旋转相关函数



// 旋转图片函数
function rotateImage(angle) {
    if (!originalImage) {
        showStatus('请先上传图片！', 'error');
        return;
    }
    
    try {
        currentRotationAngle += angle;
        applyRotation(currentRotationAngle);
        showStatus(`图片已旋转 ${angle}°，当前总角度: ${currentRotationAngle}°`, 'success');
    } catch (error) {
        console.error('旋转图片失败:', error);
        showStatus('旋转图片失败: ' + error.message, 'error');
    }
}



// 执行旋转操作
function applyRotation(angle) {
    if (!originalImage) return;
    
    try {
        const canvas = document.getElementById('mainCanvas');
        const ctx = canvas.getContext('2d');
        
        // 如果角度为0，直接显示原图
        if (angle === 0) {
            canvas.width = originalCanvasWidth;
            canvas.height = originalCanvasHeight;
            cv.imshow(canvas, originalImage);
            
            // 清理旋转后的图像
            if (rotatedImage) {
                rotatedImage.delete();
                rotatedImage = null;
            }
            return;
        }
        
        // 计算旋转后的尺寸
        const radians = angle * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const newWidth = Math.ceil(originalCanvasWidth * cos + originalCanvasHeight * sin);
        const newHeight = Math.ceil(originalCanvasWidth * sin + originalCanvasHeight * cos);
        
        // 创建旋转矩阵
        const center = {x: originalCanvasWidth / 2, y: originalCanvasHeight / 2};
        const rotationMatrix = cv.getRotationMatrix2D(center, angle, 1.0);
        
        // 调整旋转矩阵以适应新尺寸
        rotationMatrix.doublePtr(0, 2)[0] += (newWidth - originalCanvasWidth) / 2;
        rotationMatrix.doublePtr(1, 2)[0] += (newHeight - originalCanvasHeight) / 2;
        
        // 清理之前的旋转图像
        if (rotatedImage) {
            rotatedImage.delete();
        }
        
        // 创建新的旋转图像
        rotatedImage = new cv.Mat();
        const dsize = new cv.Size(newWidth, newHeight);
        cv.warpAffine(originalImage, rotatedImage, rotationMatrix, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
        
        // 更新canvas尺寸并显示旋转后的图像
        canvas.width = newWidth;
        canvas.height = newHeight;
        cv.imshow(canvas, rotatedImage);
        
        // 清理临时对象
        rotationMatrix.delete();
        
        // 更新灰度图像用于后续处理
        if (grayImage) {
            grayImage.delete();
        }
        grayImage = new cv.Mat();
        cv.cvtColor(rotatedImage, grayImage, cv.COLOR_RGBA2GRAY);
        
        // 保持用户的模板选择和手动标记状态
        // 不清除templateRect, template, manualMarks
        
        // 如果有模板选择，保持按钮状态
        if (templateRect && template) {
            showStatus(`图片已旋转 ${angle}°，模板选择已保持`, 'success');
        } else {
            showStatus('请重新选择模板区域', 'info');
        }
        
    } catch (error) {
        console.error('旋转操作失败:', error);
        showStatus('旋转操作失败: ' + error.message, 'error');
    }
}

// 自动检测角度并转正
function autoRotateImage() {
    if (!originalImage) {
        showStatus('请先上传图片！', 'error');
        return;
    }
    
    try {
        showStatus('正在检测图片角度...', 'info');
        
        // 转换为灰度图
        const gray = new cv.Mat();
        cv.cvtColor(originalImage, gray, cv.COLOR_RGBA2GRAY);
        
        // 边缘检测
        const edges = new cv.Mat();
        cv.Canny(gray, edges, 50, 150, 3, false);
        
        // 霍夫直线检测
        const lines = new cv.Mat();
        cv.HoughLines(edges, lines, 1, Math.PI / 180, 80, 0, 0, 0, Math.PI);
        
        if (lines.rows === 0) {
            showStatus('未检测到明显的直线，尝试基于内容检测...', 'info');
            // 如果没有检测到直线，尝试基于图像内容的简单检测
            detectOrientationByContent(gray);
            gray.delete();
            edges.delete();
            lines.delete();
            return;
        }
        
        // 计算主要角度
        let angles = [];
        for (let i = 0; i < lines.rows; i++) {
            const rho = lines.data32F[i * 2];
            const theta = lines.data32F[i * 2 + 1];
            let angle = (theta * 180 / Math.PI);
            
            // 将角度标准化到-90到90度范围
            if (angle > 90) angle -= 180;
            if (angle < -90) angle += 180;
            
            angles.push(angle);
        }
        
        // 统计角度分布，找到主要方向
        const angleBins = {};
        const binSize = 5; // 5度为一个区间
        
        angles.forEach(angle => {
            const bin = Math.round(angle / binSize) * binSize;
            angleBins[bin] = (angleBins[bin] || 0) + 1;
        });
        
        // 找到最频繁的角度
        let bestAngle = 0;
        let maxCount = 0;
        
        for (const [angle, count] of Object.entries(angleBins)) {
            if (count > maxCount) {
                maxCount = count;
                bestAngle = parseFloat(angle);
            }
        }
        
        // 计算需要的校正角度，使图片转正
        let correctionAngle = 0;
        
        // 将检测到的角度转换为最接近的90度倍数的校正角度
        if (Math.abs(bestAngle) < 45) {
            correctionAngle = -bestAngle; // 小角度倾斜，直接校正
        } else if (bestAngle > 45) {
            correctionAngle = 90 - bestAngle; // 接近90度，校正到90度
        } else if (bestAngle < -45) {
            correctionAngle = -90 - bestAngle; // 接近-90度，校正到-90度
        }
        
        // 如果校正角度太小，可能图片已经是正的
        if (Math.abs(correctionAngle) < 2) {
            showStatus('图片角度已经基本正确，无需校正', 'info');
        } else {
            currentRotationAngle += correctionAngle;
            applyRotation(correctionAngle);
            showStatus(`自动检测完成，已校正角度: ${correctionAngle.toFixed(1)}°`, 'success');
        }
        
        // 清理临时对象
        gray.delete();
        edges.delete();
        lines.delete();
        
    } catch (error) {
        console.error('自动角度检测失败:', error);
        showStatus('自动角度检测失败: ' + error.message, 'error');
    }
}

// 基于图像内容检测方向（备用方法）
function detectOrientationByContent(grayImage) {
    try {
        // 简单的基于图像重心的检测方法
        const moments = cv.moments(grayImage);
        
        if (moments.m00 === 0) {
            showStatus('无法检测图片方向，请手动旋转', 'info');
            return;
        }
        
        // 计算图像的主轴角度
        const mu20 = moments.mu20 / moments.m00;
        const mu02 = moments.mu02 / moments.m00;
        const mu11 = moments.mu11 / moments.m00;
        
        const angle = 0.5 * Math.atan2(2 * mu11, mu20 - mu02) * 180 / Math.PI;
        
        // 如果角度偏差较大，进行校正
        if (Math.abs(angle) > 5) {
            const correctionAngle = -angle;
            currentRotationAngle += correctionAngle;
            applyRotation(correctionAngle);
            showStatus(`基于内容检测完成，已校正角度: ${correctionAngle.toFixed(1)}°`, 'success');
        } else {
            showStatus('图片方向基本正确', 'info');
        }
        
    } catch (error) {
        console.error('内容检测失败:', error);
        showStatus('无法自动检测图片方向，请手动旋转', 'info');
    }
}

// 进度条控制函数
function showProgress(percentage, text) {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (progressContainer && progressBar && progressText) {
        progressContainer.style.display = 'block';
        progressBar.style.width = percentage + '%';
        progressText.textContent = text;
    }
}

function hideProgress() {
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

function updateProgress(percentage, text) {
    showProgress(percentage, text);
}

// 初始化缩放控制事件
document.addEventListener('DOMContentLoaded', function() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
        zoomSlider.addEventListener('input', function() {
            currentZoom = parseFloat(this.value);
            applyZoom();
            updateZoomDisplay();
        });
    }
});

// Neutralino.js 初始化
if (typeof Neutralino !== 'undefined') {
    Neutralino.init();
    
    // 监听窗口关闭事件
    Neutralino.events.on('windowClose', () => {
        Neutralino.app.exit();
    });
    
    console.log('Neutralino.js initialized successfully');
} else {
    console.log('Neutralino.js not available - running in browser mode');
}