import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { AppColors } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Por favor ingresa tu correo y contraseña.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/");
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error de autenticación");
      }
    } finally {
      setLoading(false);
    }
  }

  const styles = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 60,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Feather name="shield" size={40} color="#fff" />
          </View>
          <Text style={styles.appName}>SafeNode</Text>
          <Text style={styles.subtitle}>Inteligencia en Seguridad Logística</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <View style={styles.inputRow}>
              <Feather name="mail" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="correo@empresa.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                testID="email-input"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputRow}>
              <Feather name="lock" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                testID="password-input"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Feather
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.loginBtn,
              pressed && styles.loginBtnPressed,
              loading && styles.loginBtnDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Entrar</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>SafeNode S.A.S. · Seguridad Logística</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      alignItems: "center",
      backgroundColor: colors.navyDark,
      paddingHorizontal: 24,
    },
    logoArea: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 8,
    },
    appName: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
      letterSpacing: 1,
    },
    subtitle: {
      fontSize: 13,
      color: "rgba(255,255,255,0.6)",
      marginTop: 4,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    card: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    },
    cardTitle: {
      fontSize: 20,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 20,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.dangerLight,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    errorText: {
      flex: 1,
      fontSize: 14,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 6,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      height: 48,
    },
    inputIcon: {
      marginRight: 8,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    eyeBtn: {
      paddingLeft: 8,
    },
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 4,
    },
    loginBtnPressed: {
      opacity: 0.85,
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: "#ffffff",
    },
    footer: {
      marginTop: 32,
      fontSize: 12,
      color: "rgba(255,255,255,0.35)",
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
  });
}
