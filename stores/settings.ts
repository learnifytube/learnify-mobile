import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LanguageOption {
    code: string;
    name: string;
}

export const LANGUAGES: LanguageOption[] = [
    { code: "en", name: "English" },
    { code: "th", name: "Thai" },
    { code: "vi", name: "Vietnamese" },
    { code: "zh", name: "Chinese" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" },
    { code: "id", name: "Indonesian" },
    { code: "ms", name: "Malay" },
    { code: "it", name: "Italian" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
];

interface SettingsStore {
    translationTargetLang: string;
    setTranslationTargetLang: (lang: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            translationTargetLang: "en",
            setTranslationTargetLang: (lang) => set({ translationTargetLang: lang }),
        }),
        {
            name: "learnify-settings",
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
