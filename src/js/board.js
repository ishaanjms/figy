const board = document.getElementById("board");
const canvas = document.getElementById("canvas");
const drawLayer = document.getElementById("drawLayer");
const marqueeSelection = document.createElement("div");
marqueeSelection.className = "marquee-selection";
const selectButton = document.getElementById("selectTool");
const panButton = document.getElementById("panTool");
const addButton = document.getElementById("addSticky");
const stickyTool = document.getElementById("stickyTool");
const stickyToolMenu = document.getElementById("stickyToolMenu");
const textButton = document.getElementById("addText");
const pencilTool = document.getElementById("pencilTool");
const pencilButton = document.getElementById("addPencil");
const pencilMenu = document.getElementById("pencilMenu");
const pencilWidth = document.getElementById("pencilWidth");
const pencilWidthValue = document.getElementById("pencilWidthValue");
const eraserButton = document.getElementById("addEraser");
const shapeTool = document.getElementById("shapeTool");
const shapeButton = document.getElementById("addShape");
const shapeMenu = document.getElementById("shapeMenu");
const themeToggle = document.getElementById("themeToggle");
const zoomInButton = document.getElementById("zoomIn");
const zoomOutButton = document.getElementById("zoomOut");
const zoomLevel = document.getElementById("zoomLevel");
const fileName = document.getElementById("fileName");
const stickyPlaceholder = "Type something...";
const textPlaceholder = "Text";
const defaultFileName = "Untitled";
let selectedElement = null;
let selectedElements = new Set();
let activeTool = "select";
let selectedStickyColor = "blue";
let selectedShape = "circle";
let selectedShapeColor = "white";
let selectedPencilColor = "#1f1f1f";
let selectedPencilWidth = 4;
let activeStroke = null;
let activeStrokePoints = [];
let activeShapeDraft = null;
let shapeStartPoint = null;
let activeResize = null;
let activeConnector = null;
let activeMarquee = null;
let activeGroupDrag = null;
let isErasing = false;
let isPanning = false;
let panStartPoint = null;
let panMoved = false;
let ignoreNextBoardClick = false;
let copiedElementData = null;
let historyStack = [];
let redoStack = [];
let isRestoringHistory = false;
let isSkippingHistory = false;
let activeDragMoved = false;
let activeResizeMoved = false;
let activeEraserRemoved = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let nextElementId = 1;
const minZoom = 0.02;
const maxZoom = 2;
const zoomStep = 0.1;
const safeZoom = 0.01;
const baseGridSize = 28;
const defaultTextSize = 28;
const strokePadding = 14;
const maxVisibleFileNameLength = 28;
const textFonts = [
  { label: "Inter", value: "Inter, Arial, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Mono", value: "'Courier New', monospace" },
  { label: "Comic", value: "'Comic Sans MS', 'Comic Sans', cursive" }
];
const shapeColors = [
  { name: "white", value: "#ffffff" },
  { name: "gray", value: "#d8dee8" },
  { name: "yellow", value: "#fff2a8" },
  { name: "orange", value: "#ffd0a6" },
  { name: "pink", value: "#ffc6dc" },
  { name: "green", value: "#bff0d6" },
  { name: "blue", value: "#a9daf7" },
  { name: "purple", value: "#d8c8ff" }
];

function updateFileNameWidth() {
  const titleLength = Math.max(defaultFileName.length, fileName.value.length);
  fileName.style.width = Math.min(maxVisibleFileNameLength, titleLength + 1) + "ch";
}

function setFileName(nextName) {
  const cleanName = nextName.trim() || defaultFileName;

  fileName.value = cleanName;
  updateFileNameWidth();
  document.title = cleanName + " - Figy";
  localStorage.setItem("figy-file-name", cleanName);
}

function setTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark", isDark);
  themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  themeToggle.setAttribute("aria-label", themeToggle.title);
  themeToggle.setAttribute("aria-pressed", isDark);
  localStorage.setItem("figy-theme", theme);
}

function setActiveTool(tool) {
  activeTool = tool;
  selectButton.classList.toggle("active", activeTool === "select");
  panButton.classList.toggle("active", activeTool === "pan");
  textButton.classList.toggle("active", activeTool === "text");
  pencilTool.classList.toggle("active", activeTool === "pencil");
  pencilButton.classList.toggle("active", activeTool === "pencil");
  eraserButton.classList.toggle("active", activeTool === "eraser");
  shapeTool.classList.toggle("active", activeTool === "shape");
  document.body.classList.toggle("tool-select", activeTool === "select");
  document.body.classList.toggle("tool-pan", activeTool === "pan");
  document.body.classList.toggle("tool-pencil", activeTool === "pencil");
  document.body.classList.toggle("tool-eraser", activeTool === "eraser");
  document.body.classList.toggle("tool-shape", activeTool === "shape");
}

function updatePencilToolSelection() {
  pencilMenu.querySelectorAll("[data-pencil-color]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pencilColor === selectedPencilColor);
  });

  pencilWidth.value = selectedPencilWidth;
  pencilWidthValue.innerText = selectedPencilWidth;
}

function clampZoom(nextZoom) {
  return Math.min(maxZoom, Math.max(minZoom, nextZoom));
}

function setZoom(nextZoom, focalPoint = getBoardCenterPoint()) {
  const nextClampedZoom = clampZoom(nextZoom);
  const boardBounds = board.getBoundingClientRect();
  const focalX = focalPoint.clientX - boardBounds.left;
  const focalY = focalPoint.clientY - boardBounds.top;
  const currentZoom = zoom || safeZoom;
  const boardPointX = (focalX - panX) / currentZoom;
  const boardPointY = (focalY - panY) / currentZoom;

  zoom = nextClampedZoom;
  setPan(focalX - boardPointX * zoom, focalY - boardPointY * zoom);
  document.documentElement.style.setProperty("--zoom", zoom);
  updateGridDensity();
  zoomLevel.value = Math.round(zoom * 100);
}

function updateGridDensity() {
  let gridScreenSize = baseGridSize * Math.max(zoom, safeZoom);

  while (gridScreenSize < 18) {
    gridScreenSize *= 2;
  }

  document.documentElement.style.setProperty("--grid-screen-size", gridScreenSize + "px");
}

function getBoardCenterPoint() {
  const boardBounds = board.getBoundingClientRect();

  return {
    clientX: boardBounds.left + boardBounds.width / 2,
    clientY: boardBounds.top + boardBounds.height / 2
  };
}

function setPan(nextPanX, nextPanY) {
  panX = nextPanX;
  panY = nextPanY;
  document.documentElement.style.setProperty("--pan-x", panX + "px");
  document.documentElement.style.setProperty("--pan-y", panY + "px");
}

function getWheelDelta(e) {
  const lineHeight = 16;
  const pageHeight = board.clientHeight;
  const multiplier = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pageHeight : 1;

  return {
    x: e.deltaX * multiplier,
    y: e.deltaY * multiplier
  };
}

function zoomWithWheel(e) {
  e.preventDefault();
  const wheelDelta = getWheelDelta(e);

  if (e.ctrlKey || e.metaKey) {
    const pinchAmount = Math.abs(wheelDelta.y) < 1 ? Math.sign(wheelDelta.y) : wheelDelta.y;
    const zoomScale = Math.exp(-pinchAmount * 0.012);
    setZoom(zoom * zoomScale, e);
    return;
  }

  setPan(panX - wheelDelta.x, panY - wheelDelta.y);
}

function applyTypedZoom() {
  const typedZoom = Number(zoomLevel.value);

  if (!Number.isFinite(typedZoom)) {
    setZoom(zoom);
    return;
  }

  setZoom(typedZoom / 100);
}

function getBoardPoint(e) {
  const boardBounds = board.getBoundingClientRect();
  const currentZoom = zoom || safeZoom;

  return {
    x: (e.clientX - boardBounds.left - panX) / currentZoom,
    y: (e.clientY - boardBounds.top - panY) / currentZoom
  };
}

function getBoardSurfacePoint(e) {
  const boardBounds = board.getBoundingClientRect();

  return {
    x: e.clientX - boardBounds.left,
    y: e.clientY - boardBounds.top
  };
}

function updateStrokePoints(stroke) {
  stroke.setAttribute("points", activeStrokePoints.map((point) => `${point.x},${point.y}`).join(" "));
}

function getPointsFromString(pointsString) {
  return pointsString.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getPointsBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys)
  };
}

function markElementSelected(element) {
  selectedElements.add(element);
  selectedElement = element;
  element.classList.add("selected");
}

function serializeBoard() {
  const items = [...canvas.children].filter((child) => child !== drawLayer).map((element) => {
    const baseData = {
      x: element.offsetLeft,
      y: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight
    };

    if (element.classList.contains("sticky")) {
      return {
        ...baseData,
        type: "sticky",
        id: element.dataset.elementId,
        color: element.dataset.color,
        text: element.querySelector(".sticky-content").innerText
      };
    }

    if (element.classList.contains("text-item")) {
      return {
        ...baseData,
        type: "text",
        fontSize: parseInt(element.style.fontSize, 10) || defaultTextSize,
        fontFamily: element.style.fontFamily || textFonts[0].value,
        fontWeight: element.style.fontWeight || "500",
        fontStyle: element.style.fontStyle || "normal",
        text: element.querySelector(".text-content").innerText
      };
    }

    if (element.classList.contains("stroke-item")) {
      return {
        ...baseData,
        type: "stroke",
        points: element.dataset.points,
        color: element.dataset.strokeColor || "#1f1f1f",
        width: Number(element.dataset.strokeWidth) || 4
      };
    }

    return {
      ...baseData,
      type: "shape",
      shape: element.dataset.shape,
      color: element.dataset.color || "white"
    };
  });

  const strokes = [...drawLayer.querySelectorAll(".drawing-stroke:not(.connector-line)")].map((stroke) => ({
    points: stroke.getAttribute("points"),
    color: stroke.getAttribute("stroke") || selectedPencilColor,
    width: Number(stroke.getAttribute("stroke-width")) || selectedPencilWidth
  }));

  const connectors = [...drawLayer.querySelectorAll(".connector-line")].map((connector) => ({
    fromId: connector.dataset.fromId,
    fromSide: connector.dataset.fromSide,
    toId: connector.dataset.toId,
    toSide: connector.dataset.toSide
  }));

  return { items, strokes, connectors };
}

function restoreBoard(snapshot) {
  isRestoringHistory = true;
  clearSelection();
  [...canvas.children].forEach((child) => {
    if (child !== drawLayer) child.remove();
  });
  drawLayer.innerHTML = "";

  snapshot.strokes.forEach((strokeData) => {
    createStrokeItem(getPointsFromString(strokeData.points), {
      color: strokeData.color,
      width: strokeData.width,
      shouldSelect: false
    });
  });

  snapshot.items.forEach((item) => {
    let element = null;

    if (item.type === "sticky") {
      element = createSticky(item.x, item.y, item.text, false);
      element.dataset.elementId = item.id || getNextElementId();
      element.dataset.color = item.color;
    }

    if (item.type === "text") {
      element = createText(item.x, item.y, item.text);
      element.style.fontSize = item.fontSize + "px";
      element.style.fontFamily = item.fontFamily;
      element.style.fontWeight = item.fontWeight;
      element.style.fontStyle = item.fontStyle;
      element.querySelector(".text-font-select").value = item.fontFamily;
      element.querySelector(".text-size-slider").value = item.fontSize;
      element.querySelector(".text-size-value").innerText = item.fontSize;
      element.querySelector("[data-format='bold']").classList.toggle("active", item.fontWeight === "700");
      element.querySelector("[data-format='italic']").classList.toggle("active", item.fontStyle === "italic");
      stopEditing(element);
    }

    if (item.type === "shape") {
      element = createShape(item.x, item.y, item.shape, item.width, item.height);
      setShapeColor(element, item.color || "white", false);
    }

    if (item.type === "stroke") {
      element = createStrokeItemFromData(item);
    }

    if (element) {
      element.style.width = item.width + "px";
      element.style.height = item.height + "px";
    }
  });

  (snapshot.connectors || []).forEach((connectorData) => {
    createConnectorLine(connectorData.fromId, connectorData.fromSide, connectorData.toId, connectorData.toSide);
  });
  updateConnectorPositions();
  syncNextElementId();
  clearSelection();
  isRestoringHistory = false;
}

function syncNextElementId() {
  const highestId = [...canvas.querySelectorAll(".sticky[data-element-id]")].reduce((highest, sticky) => {
    const idNumber = Number(sticky.dataset.elementId.replace("item-", ""));
    return Number.isFinite(idNumber) ? Math.max(highest, idNumber) : highest;
  }, 0);

  nextElementId = Math.max(nextElementId, highestId + 1);
}

function saveHistory() {
  if (isRestoringHistory || isSkippingHistory) return;

  const snapshot = JSON.stringify(serializeBoard());
  if (historyStack[historyStack.length - 1] === snapshot) return;

  historyStack.push(snapshot);
  if (historyStack.length > 80) historyStack.shift();
  redoStack = [];
}

function undoBoardChange() {
  if (historyStack.length <= 1) return;

  redoStack.push(historyStack.pop());
  restoreBoard(JSON.parse(historyStack[historyStack.length - 1]));
}

function redoBoardChange() {
  const snapshot = redoStack.pop();
  if (!snapshot) return;

  historyStack.push(snapshot);
  restoreBoard(JSON.parse(snapshot));
}

function selectElement(element) {
  if (selectedElements.size !== 1 || !selectedElements.has(element)) {
    clearSelection();
  }

  markElementSelected(element);
}

function clearSelection() {
  if (!selectedElements.size) return;

  selectedElements.forEach((element) => {
    element.classList.remove("selected");
    element.classList.remove("multi-selected");
    element.classList.remove("ai-open");
    stopEditing(element);
  });

  selectedElements.clear();
  selectedElement = null;
}

function selectElements(elements) {
  clearSelection();
  elements.forEach(markElementSelected);

  if (elements.length > 1) {
    elements.forEach((element) => {
      element.classList.add("multi-selected");
      stopEditing(element);
    });
  }
}

function updateMarqueeSelection(e) {
  if (!activeMarquee) return;

  const currentSurfacePoint = getBoardSurfacePoint(e);
  const left = Math.min(activeMarquee.startSurfacePoint.x, currentSurfacePoint.x);
  const top = Math.min(activeMarquee.startSurfacePoint.y, currentSurfacePoint.y);
  const width = Math.abs(currentSurfacePoint.x - activeMarquee.startSurfacePoint.x);
  const height = Math.abs(currentSurfacePoint.y - activeMarquee.startSurfacePoint.y);

  activeMarquee.moved = width > 4 || height > 4;
  marqueeSelection.style.left = left + "px";
  marqueeSelection.style.top = top + "px";
  marqueeSelection.style.width = width + "px";
  marqueeSelection.style.height = height + "px";
}

function finishMarqueeSelection(e) {
  if (!activeMarquee) return;

  marqueeSelection.classList.remove("active");

  if (!activeMarquee.moved) {
    activeMarquee = null;
    return;
  }

  const currentPoint = getBoardPoint(e);
  const selectionRect = {
    left: Math.min(activeMarquee.startBoardPoint.x, currentPoint.x),
    top: Math.min(activeMarquee.startBoardPoint.y, currentPoint.y),
    right: Math.max(activeMarquee.startBoardPoint.x, currentPoint.x),
    bottom: Math.max(activeMarquee.startBoardPoint.y, currentPoint.y)
  };
  const selectedItems = [...canvas.querySelectorAll(".sticky, .text-item, .shape-item, .stroke-item")].filter((element) => {
    const elementRect = {
      left: element.offsetLeft,
      top: element.offsetTop,
      right: element.offsetLeft + element.offsetWidth,
      bottom: element.offsetTop + element.offsetHeight
    };

    return (
      elementRect.left < selectionRect.right &&
      elementRect.right > selectionRect.left &&
      elementRect.top < selectionRect.bottom &&
      elementRect.bottom > selectionRect.top
    );
  });

  selectElements(selectedItems);
  ignoreNextBoardClick = true;
  activeMarquee = null;
}

function startEditing(element) {
  selectElement(element);
  const editableArea = getEditableArea(element);

  editableArea.contentEditable = true;
  element.classList.add("editing");
  editableArea.focus();
}

function stopEditing(element) {
  const editableArea = getEditableArea(element);

  editableArea.contentEditable = false;
  element.classList.remove("editing");
  editableArea.blur();
}

function setStickyAiOpen(sticky, isOpen) {
  sticky.classList.toggle("ai-open", isOpen);

  if (isOpen) {
    sticky.querySelector(".sticky-ai-input").focus();
  }
}

async function writeStickyWithAI(sticky, prompt, aiSubmitButton) {
  const stickyContent = sticky.querySelector(".sticky-content");
  const existingText = stickyContent.innerText.trim();
  const originalButtonText = aiSubmitButton.innerText;

  aiSubmitButton.disabled = true;
  aiSubmitButton.innerText = "Writing";

  try {
    const reply = await window.FigyAI.requestAIReply([
      {
        role: "user",
        content: [
          "Write short, clear sticky-note text for a FigJam-style board.",
          "Return only the final sticky-note text. No markdown table, no bullets unless useful, no explanation.",
          existingText ? "Current sticky text: " + existingText : "Current sticky text is empty.",
          "User request: " + prompt
        ].join("\n")
      }
    ]);

    stickyContent.innerText = cleanStickyAiText(reply);
    setStickyAiOpen(sticky, false);
    selectElement(sticky);
    saveHistory();
  } catch (error) {
    sticky.querySelector(".sticky-ai-status").innerText = getStickyAiErrorMessage(error);
  } finally {
    aiSubmitButton.disabled = false;
    aiSubmitButton.innerText = originalButtonText;
  }
}

function cleanStickyAiText(text) {
  return String(text)
    .replace(/^["']|["']$/g, "")
    .replace(/^[-*]\s+/gm, "")
    .trim();
}

function getStickyAiErrorMessage(error) {
  if (error?.message === "Failed to fetch") {
    return "The AI server is offline. Run npm start, then refresh Figy.";
  }

  return error?.message || "AI could not write this sticky.";
}

function getEditableArea(element) {
  return element.querySelector(".sticky-content") || element.querySelector(".text-content") || element;
}

function rectanglesOverlap(rectA, rectB, gap = 16) {
  return (
    rectA.left < rectB.right + gap &&
    rectA.right > rectB.left - gap &&
    rectA.top < rectB.bottom + gap &&
    rectA.bottom > rectB.top - gap
  );
}

function isStickySpotOpen(x, y, width, height) {
  const nextRect = {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height
  };

  return ![...canvas.querySelectorAll(".sticky")].some((sticky) => {
    const stickyRect = {
      left: sticky.offsetLeft,
      top: sticky.offsetTop,
      right: sticky.offsetLeft + sticky.offsetWidth,
      bottom: sticky.offsetTop + sticky.offsetHeight
    };

    return rectanglesOverlap(nextRect, stickyRect);
  });
}

function findOpenStickyPosition(x, y, width = 360, height = 360) {
  if (isStickySpotOpen(x, y, width, height)) return { x, y };

  const step = 56;
  const maxRings = 18;

  for (let ring = 1; ring <= maxRings; ring += 1) {
    const distance = ring * step;
    const candidates = [
      { x: x + distance, y },
      { x, y: y + distance },
      { x: x + distance, y: y + distance },
      { x: x - distance, y },
      { x, y: y - distance },
      { x: x - distance, y: y - distance },
      { x: x + distance, y: y - distance },
      { x: x - distance, y: y + distance }
    ];
    const openPosition = candidates.find((candidate) => isStickySpotOpen(candidate.x, candidate.y, width, height));

    if (openPosition) return openPosition;
  }

  return { x: x + step, y: y + step };
}

function createSticky(x = 200, y = 150, text = "", shouldAvoidOverlap = true) {
  const sticky = document.createElement("div");
  const stickyContent = document.createElement("div");
  const colorMenu = document.createElement("div");
  const position = shouldAvoidOverlap ? findOpenStickyPosition(x, y) : { x, y };

  sticky.className = "sticky";
  sticky.dataset.elementId = getNextElementId();
  sticky.dataset.color = selectedStickyColor;
  sticky.style.left = position.x + "px";
  sticky.style.top = position.y + "px";

  stickyContent.className = "sticky-content";
  stickyContent.contentEditable = false;
  stickyContent.dataset.placeholder = stickyPlaceholder;
  stickyContent.innerText = text;

  colorMenu.className = "sticky-color-menu";
  colorMenu.innerHTML = `
    <button type="button" data-color="yellow" title="Yellow" aria-label="Yellow sticky note"></button>
    <button type="button" data-color="pink" title="Pink" aria-label="Pink sticky note"></button>
    <button type="button" data-color="green" title="Green" aria-label="Green sticky note"></button>
    <button type="button" data-color="blue" title="Blue" aria-label="Blue sticky note"></button>
    <button type="button" data-color="orange" title="Orange" aria-label="Orange sticky note"></button>
    <button type="button" data-color="purple" title="Purple" aria-label="Purple sticky note"></button>
    <button type="button" data-color="white" title="White" aria-label="White sticky note"></button>
    <button type="button" data-color="gray" title="Gray" aria-label="Gray sticky note"></button>
    <span class="sticky-menu-divider" aria-hidden="true"></span>
    <button type="button" class="sticky-ai-button" data-sticky-ai title="Write with AI" aria-label="Write with AI">AI</button>
  `;

  const aiPopover = document.createElement("form");
  aiPopover.className = "sticky-ai-popover";
  aiPopover.innerHTML = `
    <label>How do you need help?</label>
    <textarea class="sticky-ai-input" rows="3" placeholder="Example: Make this a crisp product idea"></textarea>
    <div class="sticky-ai-status" aria-live="polite"></div>
    <div class="sticky-ai-actions">
      <button type="button" data-sticky-ai-cancel>Cancel</button>
      <button type="submit">Write</button>
    </div>
  `;

  sticky.append(
    stickyContent,
    colorMenu,
    aiPopover,
    createConnectorHandle("n"),
    createConnectorHandle("e"),
    createConnectorHandle("s"),
    createConnectorHandle("w")
  );
  canvas.appendChild(sticky);

  sticky.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasAlreadySelected = selectedElement === sticky;

    selectElement(sticky);

    if (wasAlreadySelected && !sticky.classList.contains("editing")) {
      startEditing(sticky);
    }
  });

  sticky.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startEditing(sticky);
  });

  stickyContent.addEventListener("blur", () => {
    stopEditing(sticky);
    saveHistory();
  });

  colorMenu.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  colorMenu.addEventListener("click", (e) => {
    const aiButton = e.target.closest("[data-sticky-ai]");

    if (aiButton) {
      e.stopPropagation();
      selectElement(sticky);
      setStickyAiOpen(sticky, true);
      return;
    }

    const colorButton = e.target.closest("button[data-color]");
    if (!colorButton) return;

    e.stopPropagation();
    selectedStickyColor = colorButton.dataset.color;
    sticky.dataset.color = colorButton.dataset.color;
    updateStickyToolSelection();
    selectElement(sticky);
    saveHistory();
  });

  aiPopover.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  aiPopover.addEventListener("click", (e) => {
    e.stopPropagation();

    if (e.target.closest("[data-sticky-ai-cancel]")) {
      setStickyAiOpen(sticky, false);
    }
  });

  aiPopover.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const prompt = aiPopover.querySelector(".sticky-ai-input").value.trim();

    if (!prompt) return;

    aiPopover.querySelector(".sticky-ai-status").innerText = "";
    writeStickyWithAI(sticky, prompt, aiPopover.querySelector("button[type='submit']"));
  });

  addConnectorBehavior(sticky);
  makeDraggable(sticky);
  selectElement(sticky);

  return sticky;
}

function getNextElementId() {
  const elementId = `item-${nextElementId}`;
  nextElementId += 1;
  return elementId;
}

function createResizeHandle(handleName) {
  const handle = document.createElement("span");

  handle.className = `resize-handle resize-handle-${handleName}`;
  handle.dataset.resizeHandle = handleName;

  return handle;
}

function createConnectorHandle(side) {
  const handle = document.createElement("span");

  handle.className = `connector-handle connector-handle-${side}`;
  handle.dataset.connectorSide = side;

  return handle;
}

function addResizeBehavior(element) {
  element.querySelectorAll("[data-resize-handle]").forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      if (activeTool !== "select") return;

      e.preventDefault();
      e.stopPropagation();
      activeResize = {
        element,
        handle: handle.dataset.resizeHandle,
        startPoint: getBoardPoint(e),
        startLeft: element.offsetLeft,
        startTop: element.offsetTop,
        startWidth: element.offsetWidth,
        startHeight: element.offsetHeight
      };
    });

    handle.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });
}

function addConnectorBehavior(sticky) {
  sticky.querySelectorAll("[data-connector-side]").forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      if (activeTool !== "select") return;

      e.preventDefault();
      e.stopPropagation();

      const startPoint = getConnectorPoint(sticky, handle.dataset.connectorSide);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("connector-line", "connector-line-draft");
      line.setAttribute("x1", startPoint.x);
      line.setAttribute("y1", startPoint.y);
      line.setAttribute("x2", startPoint.x);
      line.setAttribute("y2", startPoint.y);
      drawLayer.appendChild(line);

      activeConnector = {
        line,
        fromSticky: sticky,
        fromSide: handle.dataset.connectorSide
      };
    });

    handle.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });
}

function getStickyById(elementId) {
  return canvas.querySelector(`.sticky[data-element-id="${elementId}"]`);
}

function getConnectorPoint(sticky, side) {
  const left = sticky.offsetLeft;
  const top = sticky.offsetTop;
  const width = sticky.offsetWidth;
  const height = sticky.offsetHeight;

  if (side === "n") return { x: left + width / 2, y: top };
  if (side === "e") return { x: left + width, y: top + height / 2 };
  if (side === "s") return { x: left + width / 2, y: top + height };
  return { x: left, y: top + height / 2 };
}

function updateConnectorLine(line) {
  const fromSticky = getStickyById(line.dataset.fromId);
  const toSticky = getStickyById(line.dataset.toId);

  if (!fromSticky || !toSticky) {
    line.remove();
    return;
  }

  const fromPoint = getConnectorPoint(fromSticky, line.dataset.fromSide);
  const toPoint = getConnectorPoint(toSticky, line.dataset.toSide);

  line.setAttribute("x1", fromPoint.x);
  line.setAttribute("y1", fromPoint.y);
  line.setAttribute("x2", toPoint.x);
  line.setAttribute("y2", toPoint.y);
}

function updateConnectorPositions() {
  drawLayer.querySelectorAll(".connector-line:not(.connector-line-draft)").forEach(updateConnectorLine);
}

function removeConnectorsForElement(element) {
  if (!element.classList.contains("sticky")) return;

  drawLayer.querySelectorAll(".connector-line").forEach((line) => {
    if (line.dataset.fromId === element.dataset.elementId || line.dataset.toId === element.dataset.elementId) {
      line.remove();
    }
  });
}

function createConnectorLine(fromId, fromSide, toId, toSide) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

  line.classList.add("connector-line");
  line.dataset.fromId = fromId;
  line.dataset.fromSide = fromSide;
  line.dataset.toId = toId;
  line.dataset.toSide = toSide;
  drawLayer.appendChild(line);
  updateConnectorLine(line);

  return line;
}

function finishConnectorDrag(e) {
  if (!activeConnector) return;

  const targetHandle = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-connector-side]");
  const targetSticky = targetHandle?.closest(".sticky");

  activeConnector.line.remove();

  if (targetSticky && targetSticky !== activeConnector.fromSticky) {
    createConnectorLine(
      activeConnector.fromSticky.dataset.elementId,
      activeConnector.fromSide,
      targetSticky.dataset.elementId,
      targetHandle.dataset.connectorSide
    );
    saveHistory();
  }

  activeConnector = null;
}

function getShapeColorValue(colorName) {
  return shapeColors.find((color) => color.name === colorName)?.value || shapeColors[0].value;
}

function setShapeColor(shapeItem, colorName, shouldSave = true) {
  const color = shapeColors.find((shapeColor) => shapeColor.name === colorName) || shapeColors[0];

  shapeItem.dataset.color = color.name;
  shapeItem.style.setProperty("--shape-item-fill", color.value);
  shapeItem.querySelectorAll(".shape-color-menu [data-color]").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === color.name);
  });

  if (shouldSave) saveHistory();
}

function createText(x = 240, y = 180, text = "") {
  const textItem = document.createElement("div");
  const textContent = document.createElement("div");
  const textToolbar = document.createElement("div");

  textItem.className = "text-item";
  textItem.style.left = x + "px";
  textItem.style.top = y + "px";
  textItem.style.fontSize = defaultTextSize + "px";
  textItem.style.fontFamily = textFonts[0].value;

  textContent.className = "text-content";
  textContent.contentEditable = false;
  textContent.dataset.placeholder = textPlaceholder;
  textContent.innerText = text;

  textToolbar.className = "text-toolbar";
  textToolbar.innerHTML = `
    <label class="text-font-wrap" aria-label="Font family">
      <span>Aa</span>
      <select class="text-font-select">
        ${textFonts.map((font) => `<option value="${font.value}">${font.label}</option>`).join("")}
      </select>
    </label>
    <label class="text-size-wrap" aria-label="Text size">
      <input class="text-size-slider" type="range" min="12" max="96" step="1" value="${defaultTextSize}">
      <span class="text-size-value">${defaultTextSize}</span>
    </label>
    <button class="text-format-button" type="button" data-format="bold" title="Bold" aria-label="Bold">B</button>
    <button class="text-format-button text-format-italic" type="button" data-format="italic" title="Italic" aria-label="Italic">I</button>
  `;

  textItem.append(textContent, textToolbar);
  canvas.appendChild(textItem);

  textItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedElement === textItem) {
      clearSelection();
      return;
    }

    selectElement(textItem);
  });

  textItem.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startEditing(textItem);
  });

  textContent.addEventListener("blur", () => {
    stopEditing(textItem);
    saveHistory();
  });

  textToolbar.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  textToolbar.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  const fontSelect = textToolbar.querySelector(".text-font-select");
  const sizeSlider = textToolbar.querySelector(".text-size-slider");
  const sizeValue = textToolbar.querySelector(".text-size-value");

  fontSelect.addEventListener("change", (e) => {
    textItem.style.fontFamily = e.target.value;
    selectElement(textItem);
    saveHistory();
  });

  fontSelect.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  sizeSlider.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  sizeSlider.addEventListener("input", (e) => {
    const nextSize = e.target.value;

    textItem.style.fontSize = nextSize + "px";
    sizeValue.innerText = nextSize;
    selectElement(textItem);
    saveHistory();
  });

  textToolbar.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("click", (e) => {
      const format = e.currentTarget.dataset.format;
      const active = e.currentTarget.classList.toggle("active");

      if (format === "bold") {
        textItem.style.fontWeight = active ? "700" : "500";
      }

      if (format === "italic") {
        textItem.style.fontStyle = active ? "italic" : "normal";
      }

      selectElement(textItem);
      saveHistory();
    });
  });

  makeDraggable(textItem);
  selectElement(textItem);
  startEditing(textItem);

  return textItem;
}

function createShape(x = 260, y = 200, shape = selectedShape, width = 120, height = 120) {
  const shapeItem = document.createElement("div");
  const shapeColorMenu = document.createElement("div");

  shapeItem.className = "shape-item";
  shapeItem.dataset.shape = shape;
  shapeItem.style.left = x + "px";
  shapeItem.style.top = y + "px";
  shapeItem.style.width = width + "px";
  shapeItem.style.height = height + "px";
  shapeItem.innerHTML = `
    ${getShapeSvg(shape)}
    <span class="resize-handle resize-handle-nw" data-resize-handle="nw"></span>
    <span class="resize-handle resize-handle-ne" data-resize-handle="ne"></span>
    <span class="resize-handle resize-handle-sw" data-resize-handle="sw"></span>
    <span class="resize-handle resize-handle-se" data-resize-handle="se"></span>
  `;
  shapeColorMenu.className = "shape-color-menu";
  shapeColorMenu.innerHTML = shapeColors.map((color) => (
    `<button type="button" data-color="${color.name}" style="--swatch-color: ${color.value}" title="${color.name}" aria-label="${color.name} shape color"></button>`
  )).join("");
  shapeItem.appendChild(shapeColorMenu);

  canvas.appendChild(shapeItem);
  setShapeColor(shapeItem, selectedShapeColor, false);

  shapeItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedElement === shapeItem) {
      clearSelection();
      return;
    }

    selectElement(shapeItem);
  });

  addResizeBehavior(shapeItem);

  shapeColorMenu.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  shapeColorMenu.addEventListener("click", (e) => {
    const colorButton = e.target.closest("button[data-color]");
    if (!colorButton) return;

    e.stopPropagation();
    selectedShapeColor = colorButton.dataset.color;
    setShapeColor(shapeItem, selectedShapeColor);
    selectElement(shapeItem);
  });

  makeDraggable(shapeItem);
  selectElement(shapeItem);

  return shapeItem;
}

function createStrokeItem(points, options = {}) {
  if (!points.length) return null;

  const color = options.color || selectedPencilColor;
  const widthValue = Number(options.width) || selectedPencilWidth;
  const bounds = getPointsBounds(points);
  const padding = Math.max(strokePadding, widthValue * 2);
  const left = bounds.left - padding;
  const top = bounds.top - padding;
  const width = Math.max(1, bounds.right - bounds.left) + padding * 2;
  const height = Math.max(1, bounds.bottom - bounds.top) + padding * 2;
  const relativePoints = points.map((point) => ({
    x: point.x - left,
    y: point.y - top
  }));

  return createStrokeItemFromData({
    x: left,
    y: top,
    width,
    height,
    points: JSON.stringify(relativePoints),
    color,
    strokeWidth: widthValue
  }, options.shouldSelect !== false);
}

function createStrokeItemFromData(strokeData, shouldSelect = false) {
  const strokeItem = document.createElement("div");
  const strokeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const stroke = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  const points = typeof strokeData.points === "string" ? JSON.parse(strokeData.points) : strokeData.points;
  const color = strokeData.color || strokeData.strokeColor || selectedPencilColor;
  const widthValue = Number(strokeData.width || strokeData.strokeWidth) || selectedPencilWidth;

  strokeItem.className = "stroke-item";
  strokeItem.dataset.points = JSON.stringify(points);
  strokeItem.dataset.strokeColor = color;
  strokeItem.dataset.strokeWidth = widthValue;
  strokeItem.style.left = strokeData.x + "px";
  strokeItem.style.top = strokeData.y + "px";
  strokeItem.style.width = strokeData.width + "px";
  strokeItem.style.height = strokeData.height + "px";

  strokeSvg.setAttribute("viewBox", `0 0 ${strokeData.width} ${strokeData.height}`);
  strokeSvg.setAttribute("aria-hidden", "true");
  stroke.classList.add("drawing-stroke");
  stroke.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  stroke.setAttribute("stroke", color);
  stroke.setAttribute("stroke-width", widthValue);
  strokeSvg.appendChild(stroke);
  strokeItem.appendChild(strokeSvg);
  canvas.appendChild(strokeItem);

  strokeItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedElement === strokeItem) {
      clearSelection();
      return;
    }

    selectElement(strokeItem);
  });

  makeDraggable(strokeItem);

  if (shouldSelect) {
    selectElement(strokeItem);
  }

  return strokeItem;
}

function getShapeSvg(shape) {
  const shapes = {
    circle: '<svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true"><circle cx="60" cy="60" r="48"></circle></svg>',
    square: '<svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true"><rect x="4" y="4" width="112" height="112" rx="3" ry="3"></rect></svg>',
    triangle: '<svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true"><polygon points="60,16 108,104 12,104"></polygon></svg>',
    star: '<svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true"><polygon points="60,10 72,44 108,44 79,65 91,100 60,79 29,100 41,65 12,44 48,44"></polygon></svg>',
    pentagon: '<svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true"><polygon points="60,12 106,46 88,102 32,102 14,46"></polygon></svg>'
  };

  return shapes[shape] || shapes.circle;
}

function isEditableTarget(target) {
  return target === fileName || Boolean(target.closest?.("[contenteditable='true'], input, textarea"));
}

function copySelectedElement() {
  if (!selectedElement) return;

  if (selectedElement.classList.contains("sticky")) {
    copiedElementData = {
      type: "sticky",
      x: selectedElement.offsetLeft,
      y: selectedElement.offsetTop,
      width: selectedElement.offsetWidth,
      height: selectedElement.offsetHeight,
      color: selectedElement.dataset.color,
      text: selectedElement.querySelector(".sticky-content").innerText
    };
    return;
  }

  if (selectedElement.classList.contains("text-item")) {
    copiedElementData = {
      type: "text",
      x: selectedElement.offsetLeft,
      y: selectedElement.offsetTop,
      fontSize: parseInt(selectedElement.style.fontSize, 10) || defaultTextSize,
      fontFamily: selectedElement.style.fontFamily || textFonts[0].value,
      fontWeight: selectedElement.style.fontWeight || "500",
      fontStyle: selectedElement.style.fontStyle || "normal",
      text: selectedElement.querySelector(".text-content").innerText
    };
    return;
  }

  if (selectedElement.classList.contains("shape-item")) {
    copiedElementData = {
      type: "shape",
      x: selectedElement.offsetLeft,
      y: selectedElement.offsetTop,
      width: selectedElement.offsetWidth,
      height: selectedElement.offsetHeight,
      shape: selectedElement.dataset.shape,
      color: selectedElement.dataset.color || "white"
    };
    return;
  }

  if (selectedElement.classList.contains("stroke-item")) {
    copiedElementData = {
      type: "stroke",
      x: selectedElement.offsetLeft,
      y: selectedElement.offsetTop,
      width: selectedElement.offsetWidth,
      height: selectedElement.offsetHeight,
      points: selectedElement.dataset.points,
      color: selectedElement.dataset.strokeColor || selectedPencilColor,
      strokeWidth: Number(selectedElement.dataset.strokeWidth) || selectedPencilWidth
    };
  }
}

function pasteCopiedElement() {
  if (!copiedElementData) return;

  const pasteOffset = 28;
  const x = copiedElementData.x + pasteOffset;
  const y = copiedElementData.y + pasteOffset;
  let pastedElement = null;

  if (copiedElementData.type === "sticky") {
    pastedElement = createSticky(x, y, copiedElementData.text, false);
    pastedElement.dataset.color = copiedElementData.color;
    pastedElement.style.width = copiedElementData.width + "px";
    pastedElement.style.height = copiedElementData.height + "px";
  }

  if (copiedElementData.type === "text") {
    pastedElement = createText(x, y, copiedElementData.text);
    pastedElement.style.fontSize = copiedElementData.fontSize + "px";
    pastedElement.style.fontFamily = copiedElementData.fontFamily;
    pastedElement.style.fontWeight = copiedElementData.fontWeight;
    pastedElement.style.fontStyle = copiedElementData.fontStyle;
    pastedElement.querySelector(".text-font-select").value = copiedElementData.fontFamily;
    pastedElement.querySelector(".text-size-slider").value = copiedElementData.fontSize;
    pastedElement.querySelector(".text-size-value").innerText = copiedElementData.fontSize;
    pastedElement.querySelector("[data-format='bold']").classList.toggle("active", copiedElementData.fontWeight === "700");
    pastedElement.querySelector("[data-format='italic']").classList.toggle("active", copiedElementData.fontStyle === "italic");
    isSkippingHistory = true;
    stopEditing(pastedElement);
    isSkippingHistory = false;
  }

  if (copiedElementData.type === "shape") {
    pastedElement = createShape(
      x,
      y,
      copiedElementData.shape,
      copiedElementData.width,
      copiedElementData.height
    );
    setShapeColor(pastedElement, copiedElementData.color || "white", false);
  }

  if (copiedElementData.type === "stroke") {
    pastedElement = createStrokeItemFromData({
      x,
      y,
      width: copiedElementData.width,
      height: copiedElementData.height,
      points: copiedElementData.points,
      color: copiedElementData.color,
      strokeWidth: copiedElementData.strokeWidth
    });
  }

  if (!pastedElement) return;

  selectElement(pastedElement);
  copiedElementData.x = x;
  copiedElementData.y = y;
  saveHistory();
}

function duplicateElementForDrag(element) {
  let duplicatedElement = null;
  const x = element.offsetLeft;
  const y = element.offsetTop;

  if (element.classList.contains("sticky")) {
    duplicatedElement = createSticky(x, y, element.querySelector(".sticky-content").innerText, false);
    duplicatedElement.dataset.color = element.dataset.color;
    duplicatedElement.style.width = element.offsetWidth + "px";
    duplicatedElement.style.height = element.offsetHeight + "px";
  }

  if (element.classList.contains("text-item")) {
    const fontSize = parseInt(element.style.fontSize, 10) || defaultTextSize;
    const fontFamily = element.style.fontFamily || textFonts[0].value;
    const fontWeight = element.style.fontWeight || "500";
    const fontStyle = element.style.fontStyle || "normal";

    duplicatedElement = createText(x, y, element.querySelector(".text-content").innerText);
    duplicatedElement.style.fontSize = fontSize + "px";
    duplicatedElement.style.fontFamily = fontFamily;
    duplicatedElement.style.fontWeight = fontWeight;
    duplicatedElement.style.fontStyle = fontStyle;
    duplicatedElement.querySelector(".text-font-select").value = fontFamily;
    duplicatedElement.querySelector(".text-size-slider").value = fontSize;
    duplicatedElement.querySelector(".text-size-value").innerText = fontSize;
    duplicatedElement.querySelector("[data-format='bold']").classList.toggle("active", fontWeight === "700");
    duplicatedElement.querySelector("[data-format='italic']").classList.toggle("active", fontStyle === "italic");
    isSkippingHistory = true;
    stopEditing(duplicatedElement);
    isSkippingHistory = false;
  }

  if (element.classList.contains("shape-item")) {
    duplicatedElement = createShape(
      x,
      y,
      element.dataset.shape,
      element.offsetWidth,
      element.offsetHeight
    );
    setShapeColor(duplicatedElement, element.dataset.color || "white", false);
  }

  if (element.classList.contains("stroke-item")) {
    duplicatedElement = createStrokeItemFromData({
      x,
      y,
      width: element.offsetWidth,
      height: element.offsetHeight,
      points: element.dataset.points,
      color: element.dataset.strokeColor || selectedPencilColor,
      strokeWidth: Number(element.dataset.strokeWidth) || selectedPencilWidth
    });
  }

  return duplicatedElement;
}

function resizeShapeDraft(currentPoint, shouldConstrain = false) {
  if (!activeShapeDraft || !shapeStartPoint) return;

  const deltaX = currentPoint.x - shapeStartPoint.x;
  const deltaY = currentPoint.y - shapeStartPoint.y;
  let width = Math.abs(deltaX);
  let height = Math.abs(deltaY);

  if (shouldConstrain) {
    const size = Math.max(width, height);
    width = size;
    height = size;
  }

  const left = deltaX < 0 ? shapeStartPoint.x - width : shapeStartPoint.x;
  const top = deltaY < 0 ? shapeStartPoint.y - height : shapeStartPoint.y;

  activeShapeDraft.style.left = left + "px";
  activeShapeDraft.style.top = top + "px";
  activeShapeDraft.style.width = Math.max(width, 8) + "px";
  activeShapeDraft.style.height = Math.max(height, 8) + "px";
}

function finishShapeDraft() {
  if (!activeShapeDraft) return;

  const width = activeShapeDraft.offsetWidth;
  const height = activeShapeDraft.offsetHeight;

  if (width < 12 || height < 12) {
    activeShapeDraft.style.width = "120px";
    activeShapeDraft.style.height = "120px";
  }

  activeShapeDraft.classList.remove("drawing");
  selectElement(activeShapeDraft);
  activeShapeDraft = null;
  shapeStartPoint = null;
  setActiveTool("select");
  saveHistory();
}

function makeDraggable(element) {
  let dragging = false;
  let dragTarget = element;
  let offsetX;
  let offsetY;

  element.addEventListener("mousedown", (e) => {
    if (activeTool !== "select") return;
    if (element.classList.contains("editing")) return;

    const point = getBoardPoint(e);

    if (selectedElements.size > 1 && selectedElements.has(element) && !e.altKey) {
      dragging = true;
      activeDragMoved = false;
      activeGroupDrag = {
        startPoint: point,
        items: [...selectedElements].map((selectedItem) => ({
          element: selectedItem,
          startLeft: selectedItem.offsetLeft,
          startTop: selectedItem.offsetTop
        }))
      };
      return;
    }

    dragTarget = e.altKey ? duplicateElementForDrag(element) : element;
    if (!dragTarget) return;

    dragging = true;
    activeDragMoved = false;

    offsetX = point.x - dragTarget.offsetLeft;
    offsetY = point.y - dragTarget.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const point = getBoardPoint(e);

    if (activeGroupDrag) {
      const deltaX = point.x - activeGroupDrag.startPoint.x;
      const deltaY = point.y - activeGroupDrag.startPoint.y;

      if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
        activeDragMoved = true;
      }

      activeGroupDrag.items.forEach((item) => {
        item.element.style.left = item.startLeft + deltaX + "px";
        item.element.style.top = item.startTop + deltaY + "px";
      });
      updateConnectorPositions();
      return;
    }

    const nextLeft = point.x - offsetX;
    const nextTop = point.y - offsetY;

    if (nextLeft !== dragTarget.offsetLeft || nextTop !== dragTarget.offsetTop) {
      activeDragMoved = true;
    }

    dragTarget.style.left = nextLeft + "px";
    dragTarget.style.top = nextTop + "px";
    updateConnectorPositions();
  });

  document.addEventListener("mouseup", () => {
    if (dragging && (activeDragMoved || dragTarget !== element)) {
      saveHistory();
    }

    dragging = false;
    dragTarget = element;
    activeGroupDrag = null;
    activeDragMoved = false;
  });
}

function resizeSelectedShape(e) {
  const minSize = activeResize.element.classList.contains("sticky") ? 140 : 28;
  const point = getBoardPoint(e);
  const deltaX = point.x - activeResize.startPoint.x;
  const deltaY = point.y - activeResize.startPoint.y;
  let nextLeft = activeResize.startLeft;
  let nextTop = activeResize.startTop;
  let nextWidth = activeResize.startWidth;
  let nextHeight = activeResize.startHeight;

  if (activeResize.handle.includes("e")) {
    nextWidth = Math.max(minSize, activeResize.startWidth + deltaX);
  }

  if (activeResize.handle.includes("s")) {
    nextHeight = Math.max(minSize, activeResize.startHeight + deltaY);
  }

  if (activeResize.handle.includes("w")) {
    nextWidth = Math.max(minSize, activeResize.startWidth - deltaX);
    nextLeft = activeResize.startLeft + activeResize.startWidth - nextWidth;
  }

  if (activeResize.handle.includes("n")) {
    nextHeight = Math.max(minSize, activeResize.startHeight - deltaY);
    nextTop = activeResize.startTop + activeResize.startHeight - nextHeight;
  }

  if (e.shiftKey) {
    const size = Math.max(nextWidth, nextHeight);

    if (activeResize.handle.includes("w")) {
      nextLeft = activeResize.startLeft + activeResize.startWidth - size;
    }

    if (activeResize.handle.includes("n")) {
      nextTop = activeResize.startTop + activeResize.startHeight - size;
    }

    nextWidth = size;
    nextHeight = size;
  }

  activeResize.element.style.left = nextLeft + "px";
  activeResize.element.style.top = nextTop + "px";
  activeResize.element.style.width = nextWidth + "px";
  activeResize.element.style.height = nextHeight + "px";
  activeResizeMoved = true;
}

function updateStickyToolSelection() {
  stickyToolMenu.querySelectorAll("[data-color]").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === selectedStickyColor);
  });
}

selectButton.addEventListener("click", () => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");
  setActiveTool("select");
});

panButton.addEventListener("click", () => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");
  clearSelection();
  setActiveTool("pan");
});

addButton.addEventListener("click", (e) => {
  e.stopPropagation();
  pencilTool.classList.remove("open");
  setActiveTool("select");
  stickyTool.classList.toggle("open");
  updateStickyToolSelection();
});

stickyToolMenu.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

stickyToolMenu.addEventListener("click", (e) => {
  const colorButton = e.target.closest("button[data-color]");
  if (!colorButton) return;

  e.stopPropagation();
  selectedStickyColor = colorButton.dataset.color;
  updateStickyToolSelection();
  stickyTool.classList.remove("open");
  createSticky();
  saveHistory();
});

textButton.addEventListener("click", () => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");
  setActiveTool("text");
});

pencilButton.addEventListener("click", () => {
  const shouldOpen = activeTool !== "pencil" || !pencilTool.classList.contains("open");

  setActiveTool("pencil");
  pencilTool.classList.toggle("open", shouldOpen);
  updatePencilToolSelection();
});

pencilMenu.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

pencilMenu.addEventListener("click", (e) => {
  const colorButton = e.target.closest("[data-pencil-color]");

  if (!colorButton) return;

  e.stopPropagation();
  selectedPencilColor = colorButton.dataset.pencilColor;
  updatePencilToolSelection();
});

pencilWidth.addEventListener("input", (e) => {
  selectedPencilWidth = Number(e.target.value) || 4;
  updatePencilToolSelection();
});

eraserButton.addEventListener("click", () => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");
  setActiveTool(activeTool === "eraser" ? "select" : "eraser");
});

shapeButton.addEventListener("click", () => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");
  setActiveTool(activeTool === "shape" ? "select" : "shape");
});

shapeMenu.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

shapeMenu.addEventListener("click", (e) => {
  const shapeOption = e.target.closest("button[data-shape]");
  if (!shapeOption) return;

  e.stopPropagation();
  selectedShape = shapeOption.dataset.shape;
  setActiveTool("shape");
});

fileName.addEventListener("focus", () => {
  fileName.select();
});

fileName.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  setFileName(fileName.value);
  fileName.blur();
});

fileName.addEventListener("input", () => {
  updateFileNameWidth();
});

fileName.addEventListener("blur", () => {
  setFileName(fileName.value);
});

themeToggle.addEventListener("click", () => {
  setTheme(document.body.classList.contains("dark") ? "light" : "dark");
});

zoomOutButton.addEventListener("click", () => {
  setZoom(zoom - zoomStep);
});

zoomInButton.addEventListener("click", () => {
  setZoom(zoom + zoomStep);
});

zoomLevel.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  applyTypedZoom();
  zoomLevel.blur();
});

zoomLevel.addEventListener("blur", () => {
  applyTypedZoom();
});

board.addEventListener("click", (e) => {
  stickyTool.classList.remove("open");
  pencilTool.classList.remove("open");

  if (ignoreNextBoardClick) {
    ignoreNextBoardClick = false;
    return;
  }

  if (activeTool === "text") {
    const point = getBoardPoint(e);
    createText(point.x, point.y);
    setActiveTool("select");
    saveHistory();
    return;
  }

  clearSelection();
});

board.addEventListener("wheel", zoomWithWheel, { passive: false });

board.addEventListener("pointerdown", (e) => {
  const isBoardSurface = e.target === board || e.target === canvas || e.target === drawLayer;

  if (activeTool === "pan" && !e.target.closest("#toolbar, #zoomControls, #fileHeader")) {
    isPanning = true;
    panMoved = false;
    panStartPoint = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX,
      panY
    };
    document.body.classList.add("panning");
    clearSelection();
    return;
  }

  if (activeTool === "select" && isBoardSurface) {
    activeMarquee = {
      startBoardPoint: getBoardPoint(e),
      startSurfacePoint: getBoardSurfacePoint(e),
      moved: false
    };
    marqueeSelection.classList.add("active");
    updateMarqueeSelection(e);
    return;
  }

  if (activeTool === "shape") {
    if (e.target !== board && e.target !== canvas && e.target !== drawLayer) return;

    shapeStartPoint = getBoardPoint(e);
    activeShapeDraft = createShape(shapeStartPoint.x, shapeStartPoint.y, selectedShape, 8, 8);
    activeShapeDraft.classList.add("drawing");
    ignoreNextBoardClick = true;
    clearSelection();
    return;
  }

  if (activeTool === "pencil") {
    if (e.target !== board && e.target !== canvas && e.target !== drawLayer) return;

    const point = getBoardPoint(e);
    activeStroke = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    activeStroke.classList.add("drawing-stroke");
    activeStroke.setAttribute("stroke", selectedPencilColor);
    activeStroke.setAttribute("stroke-width", selectedPencilWidth);
    activeStrokePoints = [point];
    updateStrokePoints(activeStroke);
    drawLayer.appendChild(activeStroke);
    ignoreNextBoardClick = true;
    clearSelection();
    return;
  }

  if (activeTool === "eraser") {
    isErasing = true;
    ignoreNextBoardClick = true;
    eraseAtPoint(e);
  }
});

document.addEventListener("pointermove", (e) => {
  if (activeConnector) {
    const point = getBoardPoint(e);
    activeConnector.line.setAttribute("x2", point.x);
    activeConnector.line.setAttribute("y2", point.y);
    return;
  }

  if (activeMarquee) {
    updateMarqueeSelection(e);
    return;
  }

  if (isPanning && panStartPoint) {
    const deltaX = e.clientX - panStartPoint.clientX;
    const deltaY = e.clientY - panStartPoint.clientY;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      panMoved = true;
    }

    setPan(panStartPoint.panX + deltaX, panStartPoint.panY + deltaY);
    return;
  }

  if (activeResize) {
    resizeSelectedShape(e);
  }

  if (activeShapeDraft) {
    resizeShapeDraft(getBoardPoint(e), e.shiftKey);
  }

  if (activeStroke) {
    activeStrokePoints.push(getBoardPoint(e));
    updateStrokePoints(activeStroke);
  }

  if (isErasing) {
    eraseAtPoint(e);
  }
});

document.addEventListener("pointerup", (e) => {
  if (activeConnector) {
    finishConnectorDrag(e);
    return;
  }

  if (activeMarquee) {
    finishMarqueeSelection(e);
    return;
  }

  if (isPanning && panMoved) {
    ignoreNextBoardClick = true;
  }

  if (activeResize && activeResizeMoved) {
    saveHistory();
  }

  if (activeStroke) {
    activeStroke.remove();

    if (activeStrokePoints.length > 1) {
      createStrokeItem(activeStrokePoints);
      ignoreNextBoardClick = true;
      saveHistory();
    }
  }

  if (isErasing && activeEraserRemoved) {
    saveHistory();
  }

  isPanning = false;
  panStartPoint = null;
  panMoved = false;
  document.body.classList.remove("panning");
  finishShapeDraft();
  activeResize = null;
  activeResizeMoved = false;
  activeStroke = null;
  activeStrokePoints = [];
  isErasing = false;
  activeEraserRemoved = false;
});

board.addEventListener("dblclick", (e) => {
  if (e.target !== board && e.target !== canvas) return;
  const point = getBoardPoint(e);
  createSticky(point.x, point.y, "");
  saveHistory();
});

function eraseAtPoint(e) {
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const erasable = target && target.closest(".sticky, .text-item, .shape-item, .stroke-item");

  if (erasable && canvas.contains(erasable)) {
    if (selectedElements.has(erasable)) {
      selectedElements.delete(erasable);
      if (erasable === selectedElement) selectedElement = null;
    }

    removeConnectorsForElement(erasable);
    erasable.remove();
    activeEraserRemoved = true;
    return;
  }

  const point = getBoardPoint(e);
  const stroke = getStrokeAtPoint(point);

  if (stroke) {
    stroke.remove();
    activeEraserRemoved = true;
  }
}

function getStrokeAtPoint(point) {
  const eraseRadius = 10;
  const strokes = [...canvas.querySelectorAll(".stroke-item")].reverse();

  return strokes.find((strokeItem) => {
    const points = JSON.parse(strokeItem.dataset.points).map((point) => {
      return {
        x: strokeItem.offsetLeft + point.x,
        y: strokeItem.offsetTop + point.y
      };
    });

    return points.some((currentPoint, index) => {
      const nextPoint = points[index + 1];
      if (!nextPoint) return getDistance(point, currentPoint) <= eraseRadius;

      return getDistanceToSegment(point, currentPoint, nextPoint) <= eraseRadius;
    });
  });
}

function getDistance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function getDistanceToSegment(point, start, end) {
  const segmentLengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  if (segmentLengthSquared === 0) return getDistance(point, start);

  const distanceAlongSegment = (
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y)
  ) / segmentLengthSquared;
  const clampedDistance = Math.max(0, Math.min(1, distanceAlongSegment));

  return getDistance(point, {
    x: start.x + clampedDistance * (end.x - start.x),
    y: start.y + clampedDistance * (end.y - start.y)
  });
}

document.addEventListener("keydown", (e) => {
  if (isEditableTarget(e.target)) return;

  const isShortcut = e.ctrlKey || e.metaKey;

  if (isShortcut && e.key.toLowerCase() === "z") {
    e.preventDefault();

    if (e.shiftKey) {
      redoBoardChange();
      return;
    }

    undoBoardChange();
    return;
  }

  if (isShortcut && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redoBoardChange();
    return;
  }

  if (isShortcut && e.key.toLowerCase() === "c" && selectedElement) {
    e.preventDefault();
    copySelectedElement();
    return;
  }

  if (isShortcut && e.key.toLowerCase() === "v" && copiedElementData) {
    e.preventDefault();
    pasteCopiedElement();
    return;
  }

  const isDeleteKey = e.key === "Delete" || e.key === "Backspace";
  const isEditing = selectedElement && selectedElement.classList.contains("editing");

  if (!isDeleteKey || !selectedElements.size || isEditing) return;

  selectedElements.forEach((element) => {
    removeConnectorsForElement(element);
    element.remove();
  });
  selectedElements.clear();
  selectedElement = null;
  saveHistory();
});

board.appendChild(marqueeSelection);
setZoom(zoom);
setPan(panX, panY);
setActiveTool(activeTool);
setTheme(localStorage.getItem("figy-theme") || "light");
setFileName(localStorage.getItem("figy-file-name") || defaultFileName);
updateStickyToolSelection();
saveHistory();
