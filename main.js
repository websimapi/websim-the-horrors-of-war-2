import { generateImage, renderScene, toggleLoader, analyzeSceneForExits, placeObjectsInScene } from './scene.js';
import { getScenePrompt, getNarration, getCutscene, getObjectsForScene } from './story.js';
import { speak } from './audio.js';

const sceneContainer = document.getElementById('scene-container');
const timeDisplay = document.getElementById('time-display');
const narrationText = document.getElementById('narration-text');
const sceneImage = document.getElementById('scene-image');
const cutsceneOverlay = document.getElementById('cutscene-overlay');
const cutsceneText = document.getElementById('cutscene-text');

let gameState = {
    time: 7, // 7 AM
    day: 1,
    location: 'home',
    awakeHours: 0,
    inventory: [],
    events: {
        weaponFound: false,
    },
    isBusy: false, // Prevents clicks during generation/cutscenes
    scenes: {}, // { sceneId: { imageUrl, portals: [], objects: [] } }
    currentSceneId: 'home',
    nextSceneIndex: 0,
};

function formatTime(hour) {
    return hour.toString().padStart(2, '0') + ':00';
}

function updateUI() {
    timeDisplay.textContent = `Time: ${formatTime(gameState.time)}`;
    narrationText.textContent = getNarration(gameState);
}

async function advanceTime() {
    if (gameState.isBusy) return;
    gameState.isBusy = true;

    toggleLoader(true);

    gameState.time++;
    gameState.awakeHours++;

    if (gameState.awakeHours >= 12) {
        // TODO: Implement rest mechanic
        console.log("Time to rest.");
        gameState.time = 7;
        gameState.awakeHours = 0;
        gameState.day++;
    }

    // Event triggers are now handled by object clicks, not time.
    const prompt = getScenePrompt(gameState);
    const imageUrl = await generateImage(prompt, { aspect_ratio: "16:9" });
    gameState.scenes[gameState.currentSceneId].imageUrl = imageUrl;
    
    // We only re-populate objects if time advances in the same scene,
    // not when moving between them.
    await populateSceneWithObjects(gameState.currentSceneId);
    
    const portals = await analyzeSceneForExits(imageUrl);
    gameState.scenes[gameState.currentSceneId].portals = portals.map(p => ({...p, targetSceneId: null}));
    
    renderCurrentScene();
    updateUI();


    toggleLoader(false);
    gameState.isBusy = false;
}

async function triggerWeaponFoundEvent() {
    gameState.events.weaponFound = true;
    gameState.inventory.push('rusty_pistol');

    const eventData = getCutscene('weaponFound');

    const prompt = eventData.prompt;
    const imageUrl = await generateImage(prompt, { aspect_ratio: "16:9" });
    // We don't need to analyze exits for a cutscene image
    renderScene(imageUrl, [], [], () => {}, () =>); 
    
    sceneImage.classList.add('blur');
    cutsceneOverlay.classList.remove('hidden');

    for (const line of eventData.dialogue) {
        cutsceneText.textContent = `"${line.text}"`;
        await speak(line.text, line.voice);
    }
    
    // End of cutscene
    cutsceneOverlay.classList.add('hidden');
    sceneImage.classList.remove('blur');
    
    // Reload the home scene after the cutscene
    await loadScene(gameState.currentSceneId, false, true); // Force reload
    updateUI();
}

function renderCurrentScene() {
    const scene = gameState.scenes[gameState.currentSceneId];
    if (scene && scene.imageUrl) {
        renderScene(scene.imageUrl, scene.portals, scene.objects, handlePortalClick, handleObjectClick);
    }
}

async function handleObjectClick(object) {
    if (gameState.isBusy) return;

    if (object.type === 'dig_spot') {
        await triggerWeaponFoundEvent();
    } else {
        // For other objects, just show a simple narration for now
        narrationText.textContent = `You look at the ${object.name}.`;
    }
}

async function handlePortalClick(portal) {
    if (gameState.isBusy) return;

    let targetId = portal.targetSceneId;

    if (!targetId) {
        // First time clicking this portal, generate a new scene
        gameState.nextSceneIndex++;
        const sceneType = gameState.currentSceneId === 'home' ? 'outside' : 'inside';
        targetId = `${sceneType}_${gameState.nextSceneIndex}`;
        portal.targetSceneId = targetId; // Link this portal to the new scene ID

        // Create a back-portal in the new scene
        const backPortal = { x: 45, y: 85, width: 10, height: 15, targetSceneId: gameState.currentSceneId };
        
        gameState.scenes[targetId] = {
            id: targetId,
            imageUrl: null,
            portals: [backPortal], // Pre-populate with a way back
            objects: [],
            parentSceneId: gameState.currentSceneId,
        };
    }
    
    await loadScene(targetId);
}

async function populateSceneWithObjects(sceneId) {
    const sceneData = gameState.scenes[sceneId];
    if (!sceneData || !sceneData.imageUrl) return;

    const objectBlueprints = await getObjectsForScene(gameState);
    if (objectBlueprints.length === 0) {
        sceneData.objects = [];
        return;
    }

    // Generate images for all objects
    const objectImagePromises = objectBlueprints.map(obj => {
        // Ensure the description hints at transparency for better results
        const finalDescription = obj.description.toLowerCase().includes('transparent') 
            ? obj.description 
            : `${obj.description}. Isolated on a white background, studio lighting.`;
        return generateImage(finalDescription, { transparent: true, aspect_ratio: "1:1" });
    });
    const imageUrls = await Promise.all(objectImagePromises);
    
    const objectsWithUrls = objectBlueprints.map((obj, i) => ({
        ...obj,
        imageUrl: imageUrls[i],
    }));

    // Get placement data for all objects
    const placements = await placeObjectsInScene(sceneData.imageUrl, objectsWithUrls);

    // Combine all data into the final object array for the scene
    sceneData.objects = objectsWithUrls.map((obj, i) => ({
        ...obj,
        placement: placements[i] || null, // Assign placement or null if failed
    })).filter(obj => obj.placement); // Filter out objects that failed placement
}

async function loadScene(sceneId, isNew = false, forceReload = false) {
    gameState.isBusy = true;
    toggleLoader(true);

    gameState.currentSceneId = sceneId;
    let sceneData = gameState.scenes[sceneId];

    if (!sceneData.imageUrl || forceReload) {
        const prompt = getScenePrompt(gameState, isNew);
        sceneData.imageUrl = await generateImage(prompt, { aspect_ratio: "16:9" });
        await populateSceneWithObjects(sceneId);
        const portals = await analyzeSceneForExits(sceneData.imageUrl);
        // Add new portals without overwriting the back-portal
        sceneData.portals.push(...portals.map(p => ({...p, targetSceneId: null})));
    }

    renderCurrentScene();
    updateUI();
    toggleLoader(false);
    gameState.isBusy = false;
}


async function initializeGame() {
    gameState.isBusy = true;
    toggleLoader(true);
    
    // Create the initial scene object
    gameState.scenes['home'] = { id: 'home', imageUrl: null, portals: [], objects: [] };

    await loadScene('home', true);

    toggleLoader(false);
    gameState.isBusy = false;

    sceneContainer.addEventListener('click', advanceTime);
}

initializeGame();