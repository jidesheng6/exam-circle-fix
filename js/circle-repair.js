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
let isRegionSelecting = false; // 是否正在进行区域选择
let regionStartX = 0, regionStartY = 0; // 区域选择起始坐标
let selectedRegions = []; // 选中的检测区域数组 [{x, y, width, height}]

// 新增：可调整框相关变量
let selectedBox = null; // 当前选中的框 {type: 'template'|'detection'|'manual', index: number, rect: {x, y, width, height}}
let isResizing = false; // 是否正在调整大小
let isDragging = false; // 是否正在拖拽移动
let resizeHandle = null; // 当前调整手柄 'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'
let dragStartX = 0, dragStartY = 0; // 拖拽起始坐标
let originalBoxRect = null; // 拖拽/调整开始时的原始框位置

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

// 非极大值抑制函数，用于去除重复检测
function applyNonMaxSuppression(locations, templateSize) {
    if (locations.length === 0) return [];
    
    // 按置信度降序排序
    locations.sort((a, b) => b.confidence - a.confidence);
    
    const suppressed = [];
    const minDistance = templateSize * 0.5; // 最小距离阈值
    
    for (let i = 0; i < locations.length; i++) {
        const current = locations[i];
        let shouldSuppress = false;
        
        // 检查是否与已选择的位置过于接近
        for (let j = 0; j < suppressed.length; j++) {
            const selected = suppressed[j];
            const distance = Math.sqrt(
                Math.pow(current.x - selected.x, 2) + 
                Math.pow(current.y - selected.y, 2)
            );
            
            if (distance < minDistance) {
                shouldSuppress = true;
                break;
            }
        }
        
        if (!shouldSuppress) {
            suppressed.push(current);
        }
    }
    
    console.log(`非极大值抑制: ${locations.length} -> ${suppressed.length} 个检测结果`);
    return suppressed;
}

// 新增：检测鼠标位置相关的辅助函数
function getResizeHandle(mouseX, mouseY, rect) {
    const handleSize = 8; // 调整手柄的大小
    const x = rect.x;
    const y = rect.y;
    const w = rect.width;
    const h = rect.height;
    
    // 检测角落手柄
    if (mouseX >= x - handleSize && mouseX <= x + handleSize && 
        mouseY >= y - handleSize && mouseY <= y + handleSize) {
        return 'nw'; // 西北角
    }
    if (mouseX >= x + w - handleSize && mouseX <= x + w + handleSize && 
        mouseY >= y - handleSize && mouseY <= y + handleSize) {
        return 'ne'; // 东北角
    }
    if (mouseX >= x - handleSize && mouseX <= x + handleSize && 
        mouseY >= y + h - handleSize && mouseY <= y + h + handleSize) {
        return 'sw'; // 西南角
    }
    if (mouseX >= x + w - handleSize && mouseX <= x + w + handleSize && 
        mouseY >= y + h - handleSize && mouseY <= y + h + handleSize) {
        return 'se'; // 东南角
    }
    
    // 检测边缘手柄
    if (mouseX >= x + handleSize && mouseX <= x + w - handleSize && 
        mouseY >= y - handleSize && mouseY <= y + handleSize) {
        return 'n'; // 北边
    }
    if (mouseX >= x + handleSize && mouseX <= x + w - handleSize && 
        mouseY >= y + h - handleSize && mouseY <= y + h + handleSize) {
        return 's'; // 南边
    }
    if (mouseX >= x - handleSize && mouseX <= x + handleSize && 
        mouseY >= y + handleSize && mouseY <= y + h - handleSize) {
        return 'w'; // 西边
    }
    if (mouseX >= x + w - handleSize && mouseX <= x + w + handleSize && 
        mouseY >= y + handleSize && mouseY <= y + h - handleSize) {
        return 'e'; // 东边
    }
    
    return null;
}

function isInsideRect(mouseX, mouseY, rect) {
    return mouseX >= rect.x && mouseX <= rect.x + rect.width && 
           mouseY >= rect.y && mouseY <= rect.y + rect.height;
}

function getCursorStyle(handle) {
    switch(handle) {
        case 'nw':
        case 'se':
            return 'nw-resize';
        case 'ne':
        case 'sw':
            return 'ne-resize';
        case 'n':
        case 's':
            return 'ns-resize';
        case 'e':
        case 'w':
            return 'ew-resize';
        default:
            return 'default';
    }
}

function findBoxAtPosition(mouseX, mouseY) {
    // 计算实际图像坐标
    const currentDisplayImage = rotatedImage || originalImage;
    const canvas = document.getElementById('mainCanvas');
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    const imageX = mouseX * scaleX;
    const imageY = mouseY * scaleY;
    
    // 检查模板框
    if (templateRect) {
        const templateCanvasRect = {
            x: templateRect.x / scaleX,
            y: templateRect.y / scaleY,
            width: templateRect.width / scaleX,
            height: templateRect.height / scaleY
        };
        
        if (isInsideRect(mouseX, mouseY, templateCanvasRect)) {
            return {
                type: 'template',
                index: 0,
                rect: templateCanvasRect,
                imageRect: templateRect
            };
        }
    }
    
    // 检查检测结果框
    for (let i = 0; i < detectionResults.length; i++) {
        const result = detectionResults[i];
        const canvasRect = {
            x: result.x / scaleX,
            y: result.y / scaleY,
            width: result.width / scaleX,
            height: result.height / scaleY
        };
        
        if (isInsideRect(mouseX, mouseY, canvasRect)) {
            return {
                type: 'detection',
                index: i,
                rect: canvasRect,
                imageRect: result
            };
        }
    }
    
    // 检查手动标记框
    for (let i = 0; i < manualMarks.length; i++) {
        const mark = manualMarks[i];
        const canvasRect = {
            x: (mark.x - mark.radius) / scaleX,
            y: (mark.y - mark.radius) / scaleY,
            width: (mark.radius * 2) / scaleX,
            height: (mark.radius * 2) / scaleY
        };
        
        if (isInsideRect(mouseX, mouseY, canvasRect)) {
            return {
                type: 'manual',
                index: i,
                rect: canvasRect,
                imageRect: {
                    x: mark.x - mark.radius,
                    y: mark.y - mark.radius,
                    width: mark.radius * 2,
                    height: mark.radius * 2
                }
            };
        }
    }
    
    // 检查区域选择框
    for (let i = 0; i < selectedRegions.length; i++) {
        const region = selectedRegions[i];
        const canvasRect = {
            x: region.x / scaleX,
            y: region.y / scaleY,
            width: region.width / scaleX,
            height: region.height / scaleY
        };
        
        if (isInsideRect(mouseX, mouseY, canvasRect)) {
            return {
                type: 'region',
                index: i,
                rect: canvasRect,
                imageRect: region
            };
        }
    }
    
    return null;
}

// 检查新框是否与现有框重叠
function checkOverlapWithExistingBoxes(rectX, rectY, rectWidth, rectHeight) {
    const newRect = {
        x: rectX,
        y: rectY,
        width: rectWidth,
        height: rectHeight
    };
    
    // 检查与模板框的重叠
    if (templateRect && rectsOverlap(newRect, templateRect)) {
        return true;
    }
    
    // 检查与检测结果框的重叠
    for (let i = 0; i < detectionResults.length; i++) {
        if (rectsOverlap(newRect, detectionResults[i])) {
            return true;
        }
    }
    
    // 检查与手动标记框的重叠
    for (let i = 0; i < manualMarks.length; i++) {
        const mark = manualMarks[i];
        const markRect = {
            x: mark.x - mark.radius,
            y: mark.y - mark.radius,
            width: mark.radius * 2,
            height: mark.radius * 2
        };
        if (rectsOverlap(newRect, markRect)) {
            return true;
        }
    }
    
    return false;
}

// 检查两个矩形是否重叠
function rectsOverlap(rect1, rect2) {
    return !(rect1.x + rect1.width <= rect2.x || 
             rect2.x + rect2.width <= rect1.x || 
             rect1.y + rect1.height <= rect2.y || 
             rect2.y + rect2.height <= rect1.y);
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
    let lastClickTime = 0;
    
    canvas.addEventListener('mousedown', function(e) {
        const rect = canvas.getBoundingClientRect();
        // 考虑缩放比例计算实际坐标 - 需要相对于canvas原始尺寸
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // 定位编辑模式下检查双击
        if (isPositionEditMode) {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastClickTime;
            
            if (timeDiff < 300) { // 双击间隔小于300ms
                const boxAtPosition = findBoxAtPosition(currentX, currentY);
                if (boxAtPosition) {
                    handlePositionEditDoubleClick(currentX, currentY);
                    return;
                }
            }
            lastClickTime = currentTime;
        }
        
        // 检查是否点击了现有的框
        const boxAtPosition = findBoxAtPosition(currentX, currentY);
        
        if (boxAtPosition && (isPositionEditMode || boxAtPosition.type === 'template' || boxAtPosition.type === 'region')) {
            // 检查是否点击了调整手柄
            const handle = getResizeHandle(currentX, currentY, boxAtPosition.rect);
            
            if (handle) {
                // 开始调整大小
                isResizing = true;
                resizeHandle = handle;
                selectedBox = boxAtPosition;
                originalBoxRect = {...boxAtPosition.imageRect};
                dragStartX = currentX;
                dragStartY = currentY;
                canvas.style.cursor = getCursorStyle(handle);
                updateBoxSizeDisplay();
                return;
            } else {
                // 开始拖拽移动
                isDragging = true;
                selectedBox = boxAtPosition;
                originalBoxRect = {...boxAtPosition.imageRect};
                dragStartX = currentX;
                dragStartY = currentY;
                canvas.style.cursor = 'move';
                updateBoxSizeDisplay();
                return;
            }
        }
        
        // 点击空白区域时清除选中状态
        if (selectedBox) {
            selectedBox = null;
            updateBoxSizeDisplay();
            redrawWithAllBoxes();
        }
        
        // 区域选择模式
        if (isRegionSelecting) {
            isMouseDown = true;
            regionStartX = currentX;
            regionStartY = currentY;
            canvas.style.cursor = 'crosshair';
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
        canvas.classList.add('crosshair-cursor');
    });
    
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        // 考虑缩放比例计算实际坐标 - 需要相对于canvas原始尺寸
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // 处理调整大小
        if (isResizing && selectedBox) {
            handleResize(currentX, currentY);
            return;
        }
        
        // 处理拖拽移动
        if (isDragging && selectedBox) {
            handleDrag(currentX, currentY);
            return;
        }
        
        // 更新鼠标样式和悬停效果
        if (!isMouseDown && !isManualSelecting && !isResizing && !isDragging) {
            updateCursorStyle(currentX, currentY, canvas);
            
            // 添加悬停效果
            const hoveredBox = findBoxAtPosition(currentX, currentY);
            if (hoveredBox && (isPositionEditMode || hoveredBox.type === 'template' || hoveredBox.type === 'region')) {
                redrawWithAllBoxes(hoveredBox);
            } else {
                redrawWithAllBoxes();
            }
        }
        
        // 区域选择模式下的画框选择（实时显示画框）
        if (isRegionSelecting && isMouseDown) {
            redrawCanvasWithSelection(canvas, regionStartX, regionStartY, currentX, currentY);
            return;
        }
        
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
        
        // 结束调整大小
        if (isResizing) {
            isResizing = false;
            resizeHandle = null;
            canvas.style.cursor = 'default';
            showStatus('框大小调整完成', 'success');
            return;
        }
        
        // 结束拖拽移动
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = 'default';
            showStatus('框位置移动完成', 'success');
            return;
        }
        
        // 区域选择模式下的画框完成
        if (isRegionSelecting) {
            isMouseDown = false;
            isRegionSelecting = false;
            
            const width = Math.abs(endX - regionStartX);
            const height = Math.abs(endY - regionStartY);
            
            if (width < 10 || height < 10) {
                showStatus('选择区域太小，请重新选择！', 'error');
                redrawOriginalCanvas(canvas);
                return;
            }
            
            // 计算实际图像坐标
            const currentDisplayImage = rotatedImage || originalImage;
            const scaleX = currentDisplayImage.cols / canvas.width;
            const scaleY = currentDisplayImage.rows / canvas.height;
            
            const rectX = Math.min(regionStartX, endX) * scaleX;
            const rectY = Math.min(regionStartY, endY) * scaleY;
            const rectWidth = width * scaleX;
            const rectHeight = height * scaleY;
            
            // 添加新的区域到数组中
            const newRegion = {
                x: rectX,
                y: rectY,
                width: rectWidth,
                height: rectHeight
            };
            selectedRegions.push(newRegion);
            
            // 保持十字光标，允许继续选择区域
            canvas.style.cursor = 'crosshair';
            
            showStatus(`区域选择完成！已选择 ${selectedRegions.length} 个区域，可以继续选择其他区域，或点击"确认区域检测"按钮开始检测`, 'info');
            
            // 将最新的区域选择框设置为可选中状态，允许用户调整
            selectedBox = {
                type: 'region',
                index: selectedRegions.length - 1,
                rect: newRegion
            };
            
            // 重绘显示选中的区域
            redrawWithAllBoxes(selectedBox);
            
            // 更新按钮状态为确认区域检测，并启用按钮
            const btn = document.getElementById('autoDetectionBtn');
            btn.innerHTML = '🎯 确认区域检测';
            btn.disabled = false;
            return;
        }
        
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
            
            const rectX = Math.min(manualStartX, endX) * scaleX;
            const rectY = Math.min(manualStartY, endY) * scaleY;
            const rectWidth = width * scaleX;
            const rectHeight = height * scaleY;
            
            // 检查是否与现有框重叠
            if (checkOverlapWithExistingBoxes(rectX, rectY, rectWidth, rectHeight)) {
                showStatus('不能在已有定位框位置画框！', 'error');
                redrawWithMarks();
                return;
            }
            
            const centerX = rectX + rectWidth / 2;
            const centerY = rectY + rectHeight / 2;
            const radius = Math.min(rectWidth, rectHeight) / 2;
            
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
            
            document.getElementById('autoDetectionBtn').disabled = false;
            document.getElementById('editModeBtn').disabled = false;
            document.getElementById('repairBtn').disabled = false;
            document.getElementById('clearSelectionBtn').disabled = false;
            canvas.classList.remove('crosshair-cursor');
            showStatus(`模板已选定！区域大小: ${Math.round(w)}×${Math.round(h)}`, 'success');
            
        } catch (error) {
            console.error('模板提取错误:', error);
            showStatus('模板提取失败：' + error.message, 'error');
        }
    });
    
    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyboardInput);
}

// 新增：处理键盘输入
function handleKeyboardInput(e) {
    // 只在有选中框时处理方向键
    if (!selectedBox) return;
    
    // 检查是否是方向键
    const moveStep = 1; // 每次移动的像素数
    let deltaX = 0, deltaY = 0;
    
    switch(e.key) {
        case 'ArrowUp':
            deltaY = -moveStep;
            break;
        case 'ArrowDown':
            deltaY = moveStep;
            break;
        case 'ArrowLeft':
            deltaX = -moveStep;
            break;
        case 'ArrowRight':
            deltaX = moveStep;
            break;
        case 'Escape':
            // ESC键取消选中
            selectedBox = null;
            updateBoxSizeDisplay();
            redrawWithAllBoxes();
            return;
        default:
            return; // 不是我们关心的按键
    }
    
    // 阻止默认行为（如页面滚动）
    e.preventDefault();
    
    // 计算新位置
    const canvas = document.getElementById('mainCanvas');
    const currentDisplayImage = rotatedImage || originalImage;
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    // 转换为图像坐标系的移动量
    const imageDeltaX = deltaX * scaleX;
    const imageDeltaY = deltaY * scaleY;
    
    let newRect = {...selectedBox.imageRect};
    newRect.x += imageDeltaX;
    newRect.y += imageDeltaY;
    
    // 边界检查
    if (newRect.x < 0) newRect.x = 0;
    if (newRect.y < 0) newRect.y = 0;
    if (newRect.x + newRect.width > currentDisplayImage.cols) {
        newRect.x = currentDisplayImage.cols - newRect.width;
    }
    if (newRect.y + newRect.height > currentDisplayImage.rows) {
        newRect.y = currentDisplayImage.rows - newRect.height;
    }
    
    // 更新框数据
    updateBoxData(selectedBox, newRect);
    
    // 重绘
    redrawWithAllBoxes();
}

// 新增：应用选框尺寸设置
function applyBoxSize(target) {
    const widthInput = document.getElementById('boxWidth');
    const heightInput = document.getElementById('boxHeight');
    
    const width = parseInt(widthInput.value);
    const height = parseInt(heightInput.value);
    
    if (!width || !height || width < 10 || height < 10) {
        showStatus('请输入有效的宽度和高度值（最小10像素）', 'error');
        return;
    }
    
    const canvas = document.getElementById('mainCanvas');
    const currentDisplayImage = rotatedImage || originalImage;
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    // 转换为图像坐标系的尺寸
    const imageWidth = width * scaleX;
    const imageHeight = height * scaleY;
    
    if (target === 'selected') {
        // 应用到选中的框
        if (!selectedBox) {
            showStatus('请先选中一个框', 'error');
            return;
        }
        
        let newRect = {...selectedBox.imageRect};
        // 保持中心点不变，调整尺寸
        const centerX = newRect.x + newRect.width / 2;
        const centerY = newRect.y + newRect.height / 2;
        
        newRect.x = centerX - imageWidth / 2;
        newRect.y = centerY - imageHeight / 2;
        newRect.width = imageWidth;
        newRect.height = imageHeight;
        
        // 边界检查
        if (newRect.x < 0) newRect.x = 0;
        if (newRect.y < 0) newRect.y = 0;
        if (newRect.x + newRect.width > currentDisplayImage.cols) {
            newRect.x = currentDisplayImage.cols - newRect.width;
        }
        if (newRect.y + newRect.height > currentDisplayImage.rows) {
            newRect.y = currentDisplayImage.rows - newRect.height;
        }
        
        updateBoxData(selectedBox, newRect);
        showStatus(`已调整选中框尺寸为 ${width}×${height}`, 'success');
        
    } else if (target === 'all') {
        // 应用到所有框
        let count = 0;
        
        // 调整模板框
        if (templateRect) {
            const centerX = templateRect.x + templateRect.width / 2;
            const centerY = templateRect.y + templateRect.height / 2;
            
            templateRect.x = Math.max(0, centerX - imageWidth / 2);
            templateRect.y = Math.max(0, centerY - imageHeight / 2);
            templateRect.width = imageWidth;
            templateRect.height = imageHeight;
            
            // 边界检查
            if (templateRect.x + templateRect.width > currentDisplayImage.cols) {
                templateRect.x = currentDisplayImage.cols - templateRect.width;
            }
            if (templateRect.y + templateRect.height > currentDisplayImage.rows) {
                templateRect.y = currentDisplayImage.rows - templateRect.height;
            }
            
            // 重新提取模板
            if (template) template.delete();
            let currentGrayImage;
            if (rotatedImage) {
                currentGrayImage = new cv.Mat();
                cv.cvtColor(rotatedImage, currentGrayImage, cv.COLOR_RGBA2GRAY);
            } else {
                currentGrayImage = grayImage;
            }
            template = currentGrayImage.roi(templateRect);
            count++;
        }
        
        // 调整检测结果框
        detectionResults.forEach(result => {
            const centerX = result.x + result.width / 2;
            const centerY = result.y + result.height / 2;
            
            result.x = Math.max(0, centerX - imageWidth / 2);
            result.y = Math.max(0, centerY - imageHeight / 2);
            result.width = imageWidth;
            result.height = imageHeight;
            
            // 边界检查
            if (result.x + result.width > currentDisplayImage.cols) {
                result.x = currentDisplayImage.cols - result.width;
            }
            if (result.y + result.height > currentDisplayImage.rows) {
                result.y = currentDisplayImage.rows - result.height;
            }
            count++;
        });
        
        // 调整手动标记框
        manualMarks.forEach(mark => {
            const radius = Math.min(imageWidth, imageHeight) / 2;
            mark.radius = radius;
            
            // 边界检查
            if (mark.x - radius < 0) mark.x = radius;
            if (mark.y - radius < 0) mark.y = radius;
            if (mark.x + radius > currentDisplayImage.cols) {
                mark.x = currentDisplayImage.cols - radius;
            }
            if (mark.y + radius > currentDisplayImage.rows) {
                mark.y = currentDisplayImage.rows - radius;
            }
            count++;
        });
        
        showStatus(`已调整 ${count} 个框的尺寸为 ${width}×${height}`, 'success');
    }
    
    // 重绘
    redrawWithAllBoxes();
    
    // 清空输入框
    widthInput.value = '';
    heightInput.value = '';
}

// 新增：更新选中框时显示当前尺寸
function updateBoxSizeDisplay() {
    const widthInput = document.getElementById('boxWidth');
    const heightInput = document.getElementById('boxHeight');
    
    if (selectedBox) {
        const canvas = document.getElementById('mainCanvas');
        const currentDisplayImage = rotatedImage || originalImage;
        const scaleX = currentDisplayImage.cols / canvas.width;
        const scaleY = currentDisplayImage.rows / canvas.height;
        
        // 转换为canvas坐标系的尺寸
        const canvasWidth = Math.round(selectedBox.imageRect.width / scaleX);
        const canvasHeight = Math.round(selectedBox.imageRect.height / scaleY);
        
        // 将实际值填入输入框
        widthInput.value = canvasWidth;
        heightInput.value = canvasHeight;
        widthInput.placeholder = '宽度';
        heightInput.placeholder = '高度';
    } else {
        // 清空输入框值
        widthInput.value = '';
        heightInput.value = '';
        widthInput.placeholder = '宽度';
        heightInput.placeholder = '高度';
    }
}

// 新增：处理调整大小
function handleResize(currentX, currentY) {
    if (!selectedBox || !originalBoxRect) return;
    
    const canvas = document.getElementById('mainCanvas');
    const currentDisplayImage = rotatedImage || originalImage;
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    const deltaX = (currentX - dragStartX) * scaleX;
    const deltaY = (currentY - dragStartY) * scaleY;
    
    let newRect = {...originalBoxRect};
    
    // 根据调整手柄类型计算新的矩形
    switch(resizeHandle) {
        case 'nw':
            newRect.x += deltaX;
            newRect.y += deltaY;
            newRect.width -= deltaX;
            newRect.height -= deltaY;
            break;
        case 'ne':
            newRect.y += deltaY;
            newRect.width += deltaX;
            newRect.height -= deltaY;
            break;
        case 'sw':
            newRect.x += deltaX;
            newRect.width -= deltaX;
            newRect.height += deltaY;
            break;
        case 'se':
            newRect.width += deltaX;
            newRect.height += deltaY;
            break;
        case 'n':
            newRect.y += deltaY;
            newRect.height -= deltaY;
            break;
        case 's':
            newRect.height += deltaY;
            break;
        case 'w':
            newRect.x += deltaX;
            newRect.width -= deltaX;
            break;
        case 'e':
            newRect.width += deltaX;
            break;
    }
    
    // 确保最小尺寸
    const minSize = 20;
    if (newRect.width < minSize) {
        if (resizeHandle.includes('w')) {
            newRect.x = originalBoxRect.x + originalBoxRect.width - minSize;
        }
        newRect.width = minSize;
    }
    if (newRect.height < minSize) {
        if (resizeHandle.includes('n')) {
            newRect.y = originalBoxRect.y + originalBoxRect.height - minSize;
        }
        newRect.height = minSize;
    }
    
    // 更新对应的数据结构
    updateBoxData(selectedBox, newRect);
    
    // 重绘
    redrawWithAllBoxes();
}

// 新增：处理拖拽移动
function handleDrag(currentX, currentY) {
    if (!selectedBox || !originalBoxRect) return;
    
    const canvas = document.getElementById('mainCanvas');
    const currentDisplayImage = rotatedImage || originalImage;
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    const deltaX = (currentX - dragStartX) * scaleX;
    const deltaY = (currentY - dragStartY) * scaleY;
    
    let newRect = {
        x: originalBoxRect.x + deltaX,
        y: originalBoxRect.y + deltaY,
        width: originalBoxRect.width,
        height: originalBoxRect.height
    };
    
    // 边界检查
    if (newRect.x < 0) newRect.x = 0;
    if (newRect.y < 0) newRect.y = 0;
    if (newRect.x + newRect.width > currentDisplayImage.cols) {
        newRect.x = currentDisplayImage.cols - newRect.width;
    }
    if (newRect.y + newRect.height > currentDisplayImage.rows) {
        newRect.y = currentDisplayImage.rows - newRect.height;
    }
    
    // 更新对应的数据结构
    updateBoxData(selectedBox, newRect);
    
    // 重绘
    redrawWithAllBoxes();
}

// 新增：更新框数据
function updateBoxData(box, newRect) {
    switch(box.type) {
        case 'template':
            templateRect.x = newRect.x;
            templateRect.y = newRect.y;
            templateRect.width = newRect.width;
            templateRect.height = newRect.height;
            
            // 重新提取模板
            if (template) template.delete();
            const currentDisplayImage = rotatedImage || originalImage;
            let currentGrayImage;
            if (rotatedImage) {
                currentGrayImage = new cv.Mat();
                cv.cvtColor(rotatedImage, currentGrayImage, cv.COLOR_RGBA2GRAY);
            } else {
                currentGrayImage = grayImage;
            }
            template = currentGrayImage.roi(templateRect);
            break;
            
        case 'detection':
            detectionResults[box.index].x = newRect.x;
            detectionResults[box.index].y = newRect.y;
            detectionResults[box.index].width = newRect.width;
            detectionResults[box.index].height = newRect.height;
            break;
            
        case 'manual':
            const centerX = newRect.x + newRect.width / 2;
            const centerY = newRect.y + newRect.height / 2;
            const radius = Math.min(newRect.width, newRect.height) / 2;
            manualMarks[box.index].x = centerX;
            manualMarks[box.index].y = centerY;
            manualMarks[box.index].radius = radius;
            break;
            
        case 'region':
            selectedRegions[box.index].x = newRect.x;
            selectedRegions[box.index].y = newRect.y;
            selectedRegions[box.index].width = newRect.width;
            selectedRegions[box.index].height = newRect.height;
            break;
    }
    
    // 更新selectedBox中的rect信息
    const canvas = document.getElementById('mainCanvas');
    const currentDisplayImage2 = rotatedImage || originalImage;
    const scaleX = currentDisplayImage2.cols / canvas.width;
    const scaleY = currentDisplayImage2.rows / canvas.height;
    
    box.rect = {
        x: newRect.x / scaleX,
        y: newRect.y / scaleY,
        width: newRect.width / scaleX,
        height: newRect.height / scaleY
    };
    box.imageRect = newRect;
}

// 新增：更新鼠标样式
function updateCursorStyle(mouseX, mouseY, canvas) {
    const boxAtPosition = findBoxAtPosition(mouseX, mouseY);
    
    // 只在定位编辑模式或模板框上显示调整样式
    if (boxAtPosition && (isPositionEditMode || boxAtPosition.type === 'template')) {
        const handle = getResizeHandle(mouseX, mouseY, boxAtPosition.rect);
        if (handle) {
            canvas.style.cursor = getCursorStyle(handle);
        } else {
            canvas.style.cursor = 'move';
        }
    } else if (isEditMode || template || isRegionSelecting || originalImage) {
        // 手动选择模式、模板选择模式、区域选择模式或有图片时都显示黑色十字光标
        canvas.style.cursor = '';
        canvas.classList.add('crosshair-cursor');
    } else {
        canvas.style.cursor = 'default';
        canvas.classList.remove('crosshair-cursor');
    }
}

// 新增：重绘所有框
function redrawWithAllBoxes(hoveredBox = null) {
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    
    // 重绘当前显示的图像
    const currentDisplayImage = rotatedImage || originalImage;
    cv.imshow(canvas, currentDisplayImage);
    
    const scaleX = currentDisplayImage.cols / canvas.width;
    const scaleY = currentDisplayImage.rows / canvas.height;
    
    // 绘制模板框
    if (templateRect) {
        const isSelected = selectedBox && selectedBox.type === 'template';
        const isHovered = hoveredBox && hoveredBox.type === 'template';
        
        ctx.strokeStyle = isSelected ? '#ff0000' : (isHovered ? '#ff0000' : '#0066ff');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 2.5 : 2);
        ctx.setLineDash([]);
        
        // 添加发光效果
        if (isSelected || isHovered) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = isSelected ? 8 : 4;
        } else {
            ctx.shadowBlur = 0;
        }
        
        const rect = {
            x: templateRect.x / scaleX,
            y: templateRect.y / scaleY,
            width: templateRect.width / scaleX,
            height: templateRect.height / scaleY
        };
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 重置阴影
        ctx.shadowBlur = 0;
        
        // 只在选中时显示调整手柄，悬浮时不显示
        if (isSelected && (isPositionEditMode || templateRect)) {
            drawResizeHandles(ctx, rect);
        }
    }
    
    // 绘制检测结果
    detectionResults.forEach((result, index) => {
        const isSelected = selectedBox && selectedBox.type === 'detection' && selectedBox.index === index;
        const isHovered = hoveredBox && hoveredBox.type === 'detection' && hoveredBox.index === index;
        
        if (result.type === 'marked') {
            ctx.strokeStyle = isSelected ? '#ff0000' : (isHovered ? '#ff0000' : '#0066ff');
            ctx.lineWidth = isSelected ? 4 : (isHovered ? 3.5 : 3);
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = isSelected ? '#ff0000' : (isHovered ? '#ff0000' : '#0066ff');
            ctx.lineWidth = isSelected ? 3 : (isHovered ? 2.5 : 2);
            ctx.setLineDash([]);
        }
        
        // 添加发光效果
        if (isSelected || isHovered) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = isSelected ? 6 : 3;
        } else {
            ctx.shadowBlur = 0;
        }
        
        const rect = {
            x: result.x / scaleX,
            y: result.y / scaleY,
            width: result.width / scaleX,
            height: result.height / scaleY
        };
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 重置阴影
        ctx.shadowBlur = 0;
        
        // 只在选中时显示调整手柄，悬浮时不显示
        if (isSelected && isPositionEditMode) {
            drawResizeHandles(ctx, rect);
        }
    });
    
    // 绘制手动标记
    manualMarks.forEach((mark, index) => {
        const isSelected = selectedBox && selectedBox.type === 'manual' && selectedBox.index === index;
        const isHovered = hoveredBox && hoveredBox.type === 'manual' && hoveredBox.index === index;
        
        ctx.strokeStyle = isSelected ? '#ff0000' : (isHovered ? '#ff0000' : '#0066ff');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 2.5 : 2);
        ctx.setLineDash([]);
        
        // 添加发光效果
        if (isSelected || isHovered) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = isSelected ? 6 : 3;
        } else {
            ctx.shadowBlur = 0;
        }
        
        const rect = {
            x: (mark.x - mark.radius) / scaleX,
            y: (mark.y - mark.radius) / scaleY,
            width: (mark.radius * 2) / scaleX,
            height: (mark.radius * 2) / scaleY
        };
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 重置阴影
        ctx.shadowBlur = 0;
        
        // 只在选中时显示调整手柄，悬浮时不显示
        if (isSelected && isPositionEditMode) {
            drawResizeHandles(ctx, rect);
        }
    });
    
    // 绘制区域选择框
    for (let i = 0; i < selectedRegions.length; i++) {
        const region = selectedRegions[i];
        const isSelected = selectedBox && selectedBox.type === 'region' && selectedBox.index === i;
        const isHovered = hoveredBox && hoveredBox.type === 'region' && hoveredBox.index === i;
        
        ctx.strokeStyle = isSelected ? '#ff0000' : (isHovered ? '#ff0000' : '#00ff00');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 2.5 : 2);
        ctx.setLineDash([5, 5]); // 虚线样式
        
        // 添加发光效果
        if (isSelected || isHovered) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = isSelected ? 6 : 3;
        } else {
            ctx.shadowBlur = 0;
        }
        
        const rect = {
            x: region.x / scaleX,
            y: region.y / scaleY,
            width: region.width / scaleX,
            height: region.height / scaleY
        };
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 重置阴影和虚线
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        
        // 只在选中时显示调整手柄
        if (isSelected) {
            drawResizeHandles(ctx, rect);
        }
    }
}

// 新增：绘制调整手柄
function drawResizeHandles(ctx, rect) {
    const handleSize = 8;
    const x = rect.x;
    const y = rect.y;
    const w = rect.width;
    const h = rect.height;
    
    // 保存当前绘图状态
    ctx.save();
    
    // 设置阴影效果
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    // 角落手柄和边缘手柄
    const handles = [
        {x: x - handleSize/2, y: y - handleSize/2, type: 'corner'}, // nw
        {x: x + w - handleSize/2, y: y - handleSize/2, type: 'corner'}, // ne
        {x: x - handleSize/2, y: y + h - handleSize/2, type: 'corner'}, // sw
        {x: x + w - handleSize/2, y: y + h - handleSize/2, type: 'corner'}, // se
        {x: x + w/2 - handleSize/2, y: y - handleSize/2, type: 'edge'}, // n
        {x: x + w/2 - handleSize/2, y: y + h - handleSize/2, type: 'edge'}, // s
        {x: x - handleSize/2, y: y + h/2 - handleSize/2, type: 'edge'}, // w
        {x: x + w - handleSize/2, y: y + h/2 - handleSize/2, type: 'edge'} // e
    ];
    
    handles.forEach(handle => {
        // 绘制圆角矩形手柄
        const radius = handle.type === 'corner' ? 2 : 1;
        
        // 绘制圆角矩形（兼容性处理）
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(handle.x, handle.y, handleSize, handleSize, radius);
            ctx.fill();
            ctx.stroke();
        } else {
            // 降级为普通矩形
            ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
            ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
        }
    });
    
    // 恢复绘图状态
    ctx.restore();
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
    // 使用新的统一绘制函数
    redrawWithAllBoxes();
}

function redrawOriginalCanvas(canvas) {
    redrawWithAllBoxes();
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
        // 多层次检测算法
        const total = region.rows * region.cols;
        const data = region.data;
        
        // 1. 统计不同灰度级别的像素
        let veryDarkCount = 0;  // 很深色 (0-100)
        let darkCount = 0;      // 深色 (0-150)
        let mediumCount = 0;    // 中等 (150-200)
        let lightCount = 0;     // 浅色 (200-255)
        
        for (let i = 0; i < data.length; i++) {
            const pixel = data[i];
            if (pixel < 100) veryDarkCount++;
            else if (pixel < 150) darkCount++;
            else if (pixel < 200) mediumCount++;
            else lightCount++;
        }
        
        const veryDarkRatio = veryDarkCount / total;
        const darkRatio = (veryDarkCount + darkCount) / total;
        const lightRatio = lightCount / total;
        
        // 2. 边缘检测 - 检测填写痕迹
        const edges = new cv.Mat();
        cv.Canny(region, edges, 30, 100);
        
        let edgeCount = 0;
        const edgeData = edges.data;
        for (let i = 0; i < edgeData.length; i++) {
            if (edgeData[i] > 0) {
                edgeCount++;
            }
        }
        edges.delete();
        
        const edgeRatio = edgeCount / total;
        
        // 3. 方差检测 - 检测像素值的变化程度
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const mean = sum / total;
        
        let variance = 0;
        for (let i = 0; i < data.length; i++) {
            variance += Math.pow(data[i] - mean, 2);
        }
        variance = variance / total;
        const stdDev = Math.sqrt(variance);
        
        // 4. 综合判断逻辑
        // 已填写的特征：
        // - 有足够比例的深色像素
        // - 有明显的边缘（填写痕迹）
        // - 像素值有一定变化（不是纯色背景）
        
        const hasSignificantDarkPixels = veryDarkRatio > 0.08 || darkRatio > darkRatioThreshold;
        const hasWritingEdges = edgeRatio > 0.03; // 边缘比例超过3%
        const hasVariation = stdDev > 20; // 标准差大于20表示有变化
        const notTooLight = lightRatio < 0.85; // 不是85%以上都是浅色
        const hasStrongDarkSignal = veryDarkRatio > 0.25; // 很深色像素超过25%才直接认为已填写
        
        // 综合判断：需要满足更严格的条件才认为已填写
        const isMarked = (hasSignificantDarkPixels && hasWritingEdges && hasVariation) || 
                        (hasSignificantDarkPixels && hasWritingEdges && notTooLight) ||
                        hasStrongDarkSignal; // 只有在很深色像素非常多时才直接认为已填写
        
        return isMarked;
        
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
        
        // 显示检测结果对话框
        showDetectionDialog(candidateCount + markedCount);
        
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
    
    // 清除检测结果
    detectionResults = [];
    hasPreviewedDetection = false;
    
    // 清除手动标记
    manualMarks = [];
    
    // 清除区域选择
    selectedRegions = [];
    isRegionSelecting = false;
    
    // 清除选中的框
    selectedBox = null;
    
    // 重置编辑模式状态
    isEditMode = false;
    isPositionEditMode = false;
    isManualSelecting = false;
    
    // 重绘canvas，移除所有框
    const mainCanvas = document.getElementById('mainCanvas');
    if (mainCanvas && originalImage) {
        redrawOriginalCanvas(mainCanvas);
    }
    
    // 更新按钮状态
    document.getElementById('autoDetectionBtn').disabled = true;
    document.getElementById('editModeBtn').disabled = true;
    document.getElementById('repairBtn').disabled = true;
    document.getElementById('clearSelectionBtn').disabled = true;
    
    // 重置编辑模式按钮状态
    const editModeBtn = document.getElementById('editModeBtn');
    if (editModeBtn) {
        editModeBtn.textContent = '编辑模式';
        editModeBtn.classList.remove('active');
    }
    
    // 重置定位编辑按钮状态
    const positionEditBtn = document.getElementById('positionEditBtn');
    if (positionEditBtn) {
        positionEditBtn.textContent = '定位编辑';
        positionEditBtn.classList.remove('active');
        positionEditBtn.disabled = true;
    }
    
    showStatus('已清除所有选择和检测结果，请重新选择模板圆圈。', 'info');
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
        
        // 设置十字光标
        const canvas = document.getElementById('mainCanvas');
        canvas.style.cursor = 'crosshair';
        
        // 禁用其他功能按钮
        document.getElementById('autoDetectionBtn').disabled = true;
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
        
        // 恢复默认光标
        const canvas = document.getElementById('mainCanvas');
        canvas.style.cursor = 'default';
        
        // 重新启用其他功能按钮
        if (template) {
            document.getElementById('autoDetectionBtn').disabled = false;
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
        
        // 禁用其他按钮
        document.getElementById('autoDetectionBtn').disabled = true;
        document.getElementById('editModeBtn').disabled = true;
        document.getElementById('repairBtn').disabled = true;
        document.getElementById('clearSelectionBtn').disabled = true;
        
        // 清除当前选中状态
        selectedBox = null;
        
        // 重绘显示检测结果和手动标记
        redrawWithMarks();
        
        showStatus('定位编辑模式已开启，可拖拽移动和调整检测框大小，双击删除框', 'info');
    } else {
        positionEditBtn.textContent = '定位编辑';
        positionEditBtn.style.backgroundColor = '';
        
        // 重新启用其他按钮
        if (template) {
            document.getElementById('autoDetectionBtn').disabled = false;
            document.getElementById('repairBtn').disabled = false;
            document.getElementById('clearSelectionBtn').disabled = false;
        }
        document.getElementById('editModeBtn').disabled = false;
        
        // 清除选中状态
        selectedBox = null;
        isResizing = false;
        isDragging = false;
        
        // 重绘
        redrawWithAllBoxes();
        
        showStatus('定位编辑模式已关闭', 'info');
    }
}

// 处理定位编辑模式下的双击删除
function handlePositionEditDoubleClick(canvasX, canvasY) {
    const boxAtPosition = findBoxAtPosition(canvasX, canvasY);
    
    if (boxAtPosition) {
        switch(boxAtPosition.type) {
            case 'template':
                // 清除模板选择
                if (template) template.delete();
                template = null;
                templateRect = null;
                selectedBox = null;
                
                // 禁用相关按钮
                document.getElementById('autoDetectionBtn').disabled = true;
                document.getElementById('editModeBtn').disabled = true;
                document.getElementById('repairBtn').disabled = true;
                document.getElementById('clearSelectionBtn').disabled = true;
                
                showStatus('已删除模板选择框', 'info');
                break;
                
            case 'detection':
                const result = detectionResults[boxAtPosition.index];
                const centerX = result.x + result.width / 2;
                const centerY = result.y + result.height / 2;
                detectionResults.splice(boxAtPosition.index, 1);
                showStatus(`已删除检测框 (${Math.round(centerX)}, ${Math.round(centerY)})`, 'info');
                break;
                
            case 'manual':
                const mark = manualMarks[boxAtPosition.index];
                manualMarks.splice(boxAtPosition.index, 1);
                showStatus(`已删除手动标记 (${Math.round(mark.x)}, ${Math.round(mark.y)})`, 'info');
                break;
        }
        
        selectedBox = null;
        redrawWithAllBoxes();
    } else {
        showStatus('未点击到任何框', 'warning');
    }
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
    redrawWithAllBoxes();
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
    
    // 重置新增的可调整框变量
    selectedBox = null;
    isResizing = false;
    isDragging = false;
    resizeHandle = null;
    dragStartX = 0;
    dragStartY = 0;
    originalBoxRect = null;
    
    // 重置UI
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('imageDisplaySection').style.display = 'none';
    document.getElementById('rotationControlsInline').style.display = 'none';
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('resultDisplay').style.display = 'none';
    document.getElementById('autoDetectionBtn').disabled = true;
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
// 开始区域选择
function startRegionSelection() {
    if (!originalImage) {
        showStatus('请先上传图片！', 'error');
        return;
    }
    
    // 清除之前的区域选择框
    selectedRegions = [];
    selectedBox = null;
    
    // 清除除模板框外的所有检测结果和手动标记
    detectionResults = [];
    manualMarks = [];
    hasPreviewedDetection = false;
    
    isRegionSelecting = true;
    
    // 设置十字光标
    const canvas = document.getElementById('mainCanvas');
    canvas.style.cursor = 'crosshair';
    
    // 更新按钮状态
    const btn = document.getElementById('autoDetectionBtn');
    btn.disabled = true;
    btn.innerHTML = '🎯 选择区域中...';
    
    // 重绘画布以清除之前的区域框和检测结果
    redrawWithAllBoxes();
    
    showStatus('请在图像上拖拽选择要查找的区域，选择完成后可调整位置和大小', 'info');
}

// 在指定区域内进行检测
function performRegionDetection(region) {
    // 在函数开头声明变量，确保在所有执行路径中都能访问
    let regionImage = null;
    let result = null;
    
    if (!originalImage || !template) {
        showStatus('请先上传图片并选择模板！', 'error');
        return;
    }
    
    // 将currentDisplayImage定义在try块之前，确保在catch块中也能访问
    const currentDisplayImage = rotatedImage || originalImage;
    
    try {
        showProgress(0, '正在准备区域检测...');
        
        // 检查区域边界并确保参数有效
        const regionX = Math.max(0, Math.floor(region.x));
        const regionY = Math.max(0, Math.floor(region.y));
        const regionWidth = Math.floor(region.width);
        const regionHeight = Math.floor(region.height);
        
        // 确保区域在图像边界内
        const maxX = Math.min(regionX, currentDisplayImage.cols - 1);
        const maxY = Math.min(regionY, currentDisplayImage.rows - 1);
        const maxWidth = Math.min(regionWidth, currentDisplayImage.cols - maxX);
        const maxHeight = Math.min(regionHeight, currentDisplayImage.rows - maxY);
        
        // 验证区域参数
        if (maxX < 0 || maxY < 0 || maxWidth <= 0 || maxHeight <= 0 || 
            maxX >= currentDisplayImage.cols || maxY >= currentDisplayImage.rows ||
            maxX + maxWidth > currentDisplayImage.cols || maxY + maxHeight > currentDisplayImage.rows) {
            showStatus('选择的区域超出图像边界！', 'error');
            hideProgress();
            return;
        }
        
        // 确保区域大小足够进行模板匹配
        if (maxWidth < template.cols || maxHeight < template.rows) {
            showStatus('选择的区域太小，无法进行模板匹配！', 'error');
            hideProgress();
            return;
        }
        
        // 提取区域图像
        console.log('准备提取区域:', {maxX, maxY, maxWidth, maxHeight});
        
        try {
            const regionRect = new cv.Rect(maxX, maxY, maxWidth, maxHeight);
            const tempRegionImage = currentDisplayImage.roi(regionRect);
            console.log('区域图像提取成功:', {cols: tempRegionImage.cols, rows: tempRegionImage.rows});
            
            // 将区域图像转换为灰度图像，与模板保持一致
            regionImage = new cv.Mat();
            cv.cvtColor(tempRegionImage, regionImage, cv.COLOR_RGBA2GRAY);
            console.log('区域图像转换为灰度成功:', {cols: regionImage.cols, rows: regionImage.rows});
            
            // 释放临时彩色区域图像
            tempRegionImage.delete();
        } catch (roiError) {
            console.error('ROI提取失败:', roiError);
            if (regionImage) {
                regionImage.delete();
            }
            regionImage = null;
            throw new Error(`ROI提取失败: ${roiError.message || roiError}`);
        }
        
        showProgress(20, '正在区域内查找圆圈...');
        
        // 在区域内进行模板匹配
        try {
            // 验证模板匹配的前置条件
            if (!regionImage || !template) {
                throw new Error('区域图像或模板为空');
            }
            
            if (regionImage.cols < template.cols || regionImage.rows < template.rows) {
                throw new Error(`区域图像尺寸(${regionImage.cols}x${regionImage.rows})小于模板尺寸(${template.cols}x${template.rows})`);
            }
            
            console.log('开始模板匹配:', {
                regionSize: {cols: regionImage.cols, rows: regionImage.rows},
                templateSize: {cols: template.cols, rows: template.rows}
            });
            
            result = new cv.Mat();
            cv.matchTemplate(regionImage, template, result, cv.TM_CCOEFF_NORMED);
            console.log('模板匹配成功:', {resultCols: result.cols, resultRows: result.rows});
        } catch (matchError) {
            console.error('模板匹配失败:', matchError);
            throw new Error(`模板匹配失败: ${matchError.message || matchError}`);
        }
        
        showProgress(60, '正在分析检测结果...');
        
        const threshold = getThresholdValue();
        const rawLocations = [];
        
        // 查找匹配位置
        for (let y = 0; y < result.rows; y++) {
            for (let x = 0; x < result.cols; x++) {
                const value = result.floatPtr(y, x)[0];
                if (value >= threshold) {
                    // 转换为全图坐标
                    const globalX = maxX + x + template.cols / 2;
                    const globalY = maxY + y + template.rows / 2;
                    rawLocations.push({
                        x: globalX,
                        y: globalY,
                        confidence: value
                    });
                }
            }
        }
        
        // 应用非极大值抑制去除重复检测
        const locations = applyNonMaxSuppression(rawLocations, template.cols);
        
        showProgress(80, '正在处理检测结果...');
        
        // 清理资源（设置为null避免finally块重复删除）
        regionImage.delete();
        regionImage = null;
        result.delete();
        result = null;
        
        // 转换检测结果格式，确保与其他检测结果一致
        const formattedResults = [];
        let filledCount = 0;
        let unfilledCount = 0;
        
        for (const loc of locations) {
            const rect = {
                x: loc.x - template.cols / 2,
                y: loc.y - template.rows / 2,
                width: template.cols,
                height: template.rows
            };
            
            // 检查是否已填写
            try {
                const currentDisplayImage = rotatedImage || originalImage;
                const grayImage = new cv.Mat();
                cv.cvtColor(currentDisplayImage, grayImage, cv.COLOR_RGBA2GRAY);
                
                const regionMat = grayImage.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
                const darkRatioThreshold = getDarkRatioValue();
                
                if (isMarked(regionMat, darkRatioThreshold)) {
                    formattedResults.push({...rect, type: 'marked'});
                    filledCount++;
                } else {
                    formattedResults.push({...rect, type: 'candidate'});
                    unfilledCount++;
                }
                
                regionMat.delete();
                grayImage.delete();
            } catch (error) {
                console.warn('检测单个区域时出错:', error);
                formattedResults.push({...rect, type: 'candidate'});
                unfilledCount++;
            }
        }
        
        // 保存检测结果
        detectionResults = formattedResults;
        hasPreviewedDetection = true;
        
        // 清除区域选择框和相关状态
        selectedRegions = [];
        selectedBox = null;
        isRegionSelecting = false;
        
        showProgress(100, '区域检测完成');
        hideProgress();
        
        // 重置按钮状态
        const btn = document.getElementById('autoDetectionBtn');
        btn.disabled = false;
        btn.innerHTML = '🎯 区域查找';
        
        // 启用定位编辑按钮
        document.getElementById('positionEditBtn').disabled = false;
        
        // 显示检测结果
        if (formattedResults.length > 0) {
            redrawWithDetectionResults();
            
            // 显示检测结果对话框
            showDetectionDialog(locations.length);
        } else {
            showStatus('在选定区域内未找到匹配的圆圈', 'warning');
        }
        
    } catch (error) {
        console.error('区域检测出错:', error);
        console.error('错误详情:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            region: region,
            imageSize: currentDisplayImage ? {cols: currentDisplayImage.cols, rows: currentDisplayImage.rows} : 'null',
            templateSize: template ? {cols: template.cols, rows: template.rows} : 'null'
        });
        
        showStatus('区域检测失败: ' + (error.message || error.toString()), 'error');
        hideProgress();
        
        // 重置按钮状态
        const btn = document.getElementById('autoDetectionBtn');
        btn.disabled = false;
        updateDetectionMode();
    } finally {
        // 清理资源
        if (regionImage) {
            regionImage.delete();
        }
        if (result) {
            result.delete();
        }
    }
}

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