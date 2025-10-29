export async function speak(text, voice = 'en-female') {
    try {
        const result = await websim.textToSpeech({
            text: text,
            voice: voice,
        });
        
        const audio = new Audio(result.url);

        // We need to wait for the audio to finish playing before resolving the promise
        await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = reject;
            audio.play();
        });

    } catch (e) {
        console.error("Failed to play audio:", e);
    }
}

