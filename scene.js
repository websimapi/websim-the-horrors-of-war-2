const loader = document.getElementById('loader');
const sceneImage = document.getElementById('scene-image');

export function toggleLoader(show) {
    loader.classList.toggle('hidden', !show);
}

export async function generateImage(prompt, options = {}) {
    try {
        const result = await websim.imageGen({
            prompt: prompt,
            ...options
        });
        return result.url;
    } catch (e) {
        console.error("Failed to generate image:", e);
        return ''; // Fallback image returns an empty string now
    }
}

export function renderScene(imageUrl, portals, objects, onPortalClick, onObjectClick) {
    sceneImage.src = imageUrl;

    const portalsContainer = document.getElementById('portals-container');
    const objectsContainer = document.getElementById('objects-container');
    portalsContainer.innerHTML = ''; // Clear old portals
    objectsContainer.innerHTML = ''; // Clear old objects

    if (portals) {
        portals.forEach((portal, index) => {
            const portalEl = document.createElement('div');
            portalEl.classList.add('portal');
            portalEl.style.left = `${portal.x}%`;
            portalEl.style.top = `${portal.y}%`;
            portalEl.style.width = `${portal.width}%`;
            portalEl.style.height = `${portal.height}%`;
            portalEl.dataset.portalIndex = index;

            portalEl.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent advancing time
                onPortalClick(portal);
            });

            portalsContainer.appendChild(portalEl);
        });
    }

    if (objects) {
        objects.forEach((obj, index) => {
            if (!obj.imageUrl || !obj.placement) return;

            const objEl = document.createElement('img');
            objEl.src = obj.imageUrl;
            objEl.classList.add('scene-object');
            objEl.style.left = `${obj.placement.x}%`;
            objEl.style.top = `${obj.placement.y}%`;
            objEl.style.width = `${obj.placement.width}%`;
            objEl.style.height = `${obj.placement.height}%`;
            objEl.dataset.objectIndex = index;
            objEl.alt = obj.name;

            objEl.addEventListener('click', (e) => {
                e.stopPropagation();
                onObjectClick(obj);
            });

            objectsContainer.appendChild(objEl);
        });
    }
}


async function urlToDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
  });
}


export async function placeObjectsInScene(sceneImageUrl, objectsWithUrls) {
     if (!objectsWithUrls || objectsWithUrls.length === 0) {
        return [];
    }
    try {
        const sceneDataUrl = await urlToDataUrl(sceneImageUrl);
        const objectDataUrls = await Promise.all(
            objectsWithUrls.map(obj => urlToDataUrl(obj.imageUrl))
        );

        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are a scene composition expert. Given a main scene image and a set of object images, determine the best placement for each object. Respond with a JSON array where each element corresponds to an object. Each element must be an object with x, y, width, and height properties as percentages for CSS absolute positioning. Ensure the placement is logical and objects are scaled appropriately to the scene's perspective. Example: [{"x": 10, "y": 75, "width": 15, "height": 20}]`
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Main scene:' },
                        { type: 'image_url', image_url: { url: sceneDataUrl } },
                        { type: 'text', text: 'Objects to place:' },
                        ...objectDataUrls.map(url => ({ type: 'image_url', image_url: { url } }))
                    ],
                }
            ],
            json: true,
        });
        const result = JSON.parse(completion.content);
        if (Array.isArray(result) && result.length === objectsWithUrls.length) {
            return result;
        }
        return [];
    } catch(e) {
        console.error("Failed to place objects:", e);
        return [];
    }
}


export async function analyzeSceneForExits(imageUrl) {
    try {
        const imageDataUrl = await urlToDataUrl(imageUrl);

        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Analyze the image to find up to 2 clickable areas representing exits (doors, paths, archways, stairs). Respond with a JSON array of objects. Each object must have x, y, width, and height properties as percentages. Example: [{"x": 10, "y": 25, "width": 15, "height": 50}]. Respond with an empty array if no exits are found. Be precise.`
                },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: imageDataUrl } }
                    ],
                }
            ],
            json: true,
        });

        const result = JSON.parse(completion.content);
        // Basic validation
        if (Array.isArray(result)) {
            return result.filter(p => p.x && p.y && p.width && p.height);
        }
        return [];

    } catch(e) {
        console.error("Failed to analyze scene:", e);
        return []; // Return empty array on error
    }
}