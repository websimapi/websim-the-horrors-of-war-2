export function getScenePrompt(gameState, isNewLocation = false) {
    const timeOfDay = getTimeOfDay(gameState.time);
    let basePrompt = `An empty, humble, rustic cottage interior during wartime. There is at least one visible exit, like a door or a hallway. The room is tidy but sparse. The mood is quiet and somber. ${timeOfDay} light streams through a window. Oil painting style.`;

    if (gameState.currentSceneId.startsWith('outside')) {
        basePrompt = `An empty, desolate outdoor area in a war-torn region. It could be a muddy field, a quiet forest path, or a deserted village street. There is a clear path forward. The mood is tense and melancholic. ${timeOfDay} light. Oil painting style.`
    }
    
    // Modify prompt slightly for new locations to encourage variation
    if (isNewLocation) {
        basePrompt += " The architecture is slightly different from other places you've seen.";
    }

    if (gameState.events.weaponFound && gameState.currentSceneId === 'home') {
        return `The mood in the small cottage is tense. The family sits together, the weight of a recent discovery hanging in the air. ${timeOfDay} light filters in. Oil painting style.`
    }

    return basePrompt;
}

export async function getObjectsForScene(gameState) {
    const timeOfDay = getTimeOfDay(gameState.time);
    let context = "";
    let objectCount = Math.floor(Math.random() * 5) + 1; // 1 to 5 objects

    // Special case for weapon discovery in the home on day 1
    if (gameState.currentSceneId === 'home' && !gameState.events.weaponFound && gameState.day === 1) {
        return [
           { 
               name: 'Loose floorboard',
               type: 'dig_spot',
               description: 'A single loose wooden floorboard, slightly pried up, casting a small shadow. Viewed from a low angle. Photorealistic. Transparent background.'
           },
           {
               name: 'worn rug',
               type: 'scenery',
               description: 'A small, circular, faded and worn rug. Braided texture. Photorealistic. Transparent background.'
           }
       ];
   }

    if (gameState.currentSceneId === 'home') {
        context = "The scene is a humble, rustic cottage interior during wartime. It is sparse but lived-in.";
    } else if (gameState.currentSceneId.startsWith('outside')) {
        context = `The scene is a desolate outdoor area in a war-torn region during ${timeOfDay}. It could be a muddy field, a forest path, or a deserted street.`;
    }

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Based on the following context, generate a JSON array of ${objectCount} simple, everyday objects that would fit the scene. Do not include exits like doors. Each object in the array should have three properties: "name" (a short, descriptive name like "old book"), "type" ("scenery"), and "description" (a detailed prompt for an image generation model to create the object with a transparent background, e.g., "A single, worn book with a faded leather cover. Photorealistic. Transparent background.").`
                },
                { role: 'user', content: context }
            ],
            json: true,
        });
        const result = JSON.parse(completion.content);
        if (Array.isArray(result)) {
            return result.filter(obj => obj.name && obj.description && obj.type);
        }
        return [];
    } catch (e) {
        console.error("Failed to get objects for scene:", e);
        return [];
    }
}

export function getNarration(gameState) {
    if (gameState.events.weaponFound) {
        return "The world feels different now. Heavier. Your path seems to be changing course.";
    }
    if (gameState.awakeHours === 0) {
        return "You wake up. The air is still and heavy. Another day begins.";
    }
    if (gameState.time > 7 && gameState.time < 12) {
        return "The morning hours crawl by. A sense of unease lingers in the quiet house. You could explore, or click the scene to wait.";
    }
    if (gameState.time >= 12 && gameState.time < 18) {
        return "Afternoon settles in. The world outside is a distant, muffled sound.";
    }
    return "Time passes. Each tick of the clock feels unnaturally loud in the silence.";
}

function getTimeOfDay(hour) {
    if (hour >= 6 && hour < 10) return "Early morning";
    if (hour >= 10 && hour < 12) return "Mid-morning";
    if (hour >= 12 && hour < 17) return "Afternoon";
    if (hour >= 17 && hour < 20) return "Evening";
    return "Night";
}

export function getCutscene(eventName) {
    if (eventName === 'weaponFound') {
        return {
            prompt: "A close-up of an old, rusty pistol held in a child's hands. The background is the dim interior of a cottage. The focus is on the contrast between the innocence of the hands and the grimness of the object. Dramatic lighting. Photorealistic.",
            dialogue: [
                { voice: "en-male", text: "Where... where did you find this?" },
                { voice: "en-female", text: "We hoped you would never have to see one of these up close. This is why we hide." },
                { voice: "en-male", text: "The war... it's not just stories on the radio. It's at our doorstep. This gun is a terrible, necessary evil." },
                { voice: "en-female", text: "Knowing how to use it is a burden we must now give you. It is a choice between being a victim and a survivor." },
            ]
        };
    }
    return null;
}