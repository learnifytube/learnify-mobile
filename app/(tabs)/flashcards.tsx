import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConnectionStore } from "../../stores/connection";
import { api } from "../../services/api";
import type { RemoteFlashcard } from "../../types";

export default function FlashcardsScreen() {
  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const isConnected = serverUrl !== null;

  const [cards, setCards] = useState<RemoteFlashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!serverUrl) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getFlashcards(serverUrl, true);
      setCards(result.flashcards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionComplete(false);
      setReviewedCount(0);
    } catch (e) {
      console.log("[Flashcards] Failed to load:", e);
      setError("Could not load flashcards from desktop");
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (isConnected) {
      loadCards();
    }
  }, [isConnected, loadCards]);

  const handleGrade = useCallback(
    async (grade: number) => {
      if (!serverUrl || isReviewing) return;
      const card = cards[currentIndex];
      if (!card) return;

      setIsReviewing(true);
      try {
        await api.reviewFlashcard(serverUrl, card.id, grade);
        setReviewedCount((c) => c + 1);

        if (currentIndex + 1 >= cards.length) {
          setSessionComplete(true);
        } else {
          setCurrentIndex((i) => i + 1);
          setIsFlipped(false);
        }
      } catch (e) {
        console.log("[Flashcards] Review failed:", e);
      } finally {
        setIsReviewing(false);
      }
    },
    [serverUrl, cards, currentIndex, isReviewing]
  );

  // Not connected
  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>📡</Text>
          <Text style={styles.title}>Connect to Desktop</Text>
          <Text style={styles.description}>
            Connect to your desktop app to study flashcards
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>Loading flashcards...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.description}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadCards}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Session complete
  if (sessionComplete) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>🎉</Text>
          <Text style={styles.title}>Session Complete!</Text>
          <Text style={styles.description}>
            You reviewed {reviewedCount} card{reviewedCount !== 1 ? "s" : ""}
          </Text>
          <Pressable style={styles.retryButton} onPress={loadCards}>
            <Text style={styles.retryButtonText}>Study Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // No cards due
  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>✅</Text>
          <Text style={styles.title}>All Caught Up!</Text>
          <Text style={styles.description}>
            No flashcards due for review. Create more on your desktop app.
          </Text>
          <Pressable style={styles.retryButton} onPress={loadCards}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Active study session
  const card = cards[currentIndex];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / cards.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {cards.length}
        </Text>
      </View>

      {/* Card */}
      <ScrollView
        contentContainerStyle={styles.cardScrollContent}
        style={styles.cardScroll}
      >
        <Pressable
          style={styles.card}
          onPress={() => setIsFlipped((f) => !f)}
        >
          {!isFlipped ? (
            <>
              <Text style={styles.cardLabel}>FRONT</Text>
              <Text style={styles.cardContent}>{card.frontContent}</Text>
              {card.contextText && (
                <Text style={styles.cardContext}>"{card.contextText}"</Text>
              )}
              <Text style={styles.tapHint}>Tap to reveal answer</Text>
            </>
          ) : (
            <>
              <Text style={styles.cardLabel}>BACK</Text>
              <Text style={styles.cardContent}>{card.backContent}</Text>
              <Text style={[styles.cardLabel, { marginTop: 16 }]}>FRONT</Text>
              <Text style={styles.cardFrontPreview}>{card.frontContent}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Grade buttons (visible when flipped) */}
      {isFlipped && (
        <View style={styles.gradeContainer}>
          <Text style={styles.gradeLabel}>How well did you know this?</Text>
          <View style={styles.gradeButtons}>
            <Pressable
              style={[styles.gradeButton, styles.gradeAgain]}
              onPress={() => handleGrade(1)}
              disabled={isReviewing}
            >
              <Text style={styles.gradeEmoji}>😣</Text>
              <Text style={styles.gradeText}>Again</Text>
            </Pressable>
            <Pressable
              style={[styles.gradeButton, styles.gradeHard]}
              onPress={() => handleGrade(3)}
              disabled={isReviewing}
            >
              <Text style={styles.gradeEmoji}>😐</Text>
              <Text style={styles.gradeText}>Hard</Text>
            </Pressable>
            <Pressable
              style={[styles.gradeButton, styles.gradeGood]}
              onPress={() => handleGrade(4)}
              disabled={isReviewing}
            >
              <Text style={styles.gradeEmoji}>😊</Text>
              <Text style={styles.gradeText}>Good</Text>
            </Pressable>
            <Pressable
              style={[styles.gradeButton, styles.gradeEasy]}
              onPress={() => handleGrade(5)}
              disabled={isReviewing}
            >
              <Text style={styles.gradeEmoji}>🤩</Text>
              <Text style={styles.gradeText}>Easy</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    color: "#a0a0a0",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  loadingText: {
    color: "#a0a0a0",
    fontSize: 14,
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: "#e94560",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#1a1a2e",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#e94560",
    borderRadius: 3,
  },
  progressText: {
    color: "#a0a0a0",
    fontSize: 13,
    fontWeight: "500",
    minWidth: 50,
    textAlign: "right",
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 16,
    padding: 28,
    minHeight: 250,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a1a2e",
  },
  cardLabel: {
    color: "#e94560",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  cardContent: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 34,
  },
  cardFrontPreview: {
    color: "#a0a0a0",
    fontSize: 16,
    textAlign: "center",
  },
  cardContext: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 16,
  },
  tapHint: {
    color: "#555",
    fontSize: 13,
    marginTop: 24,
  },
  gradeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  gradeLabel: {
    color: "#a0a0a0",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  gradeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  gradeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  gradeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  gradeAgain: {
    backgroundColor: "#dc2626",
  },
  gradeHard: {
    backgroundColor: "#d97706",
  },
  gradeGood: {
    backgroundColor: "#059669",
  },
  gradeEasy: {
    backgroundColor: "#2563eb",
  },
});
