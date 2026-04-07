import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppColors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface ModuleCard {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  route: Href;
  color: string;
}

const MODULES: ModuleCard[] = [
  {
    id: "preoperacional",
    title: "Preoperacional",
    subtitle: "Inspección de vehículos antes de salida",
    icon: "truck",
    route: "/preoperacional" as Href,
    color: "#0077cc",
  },
  {
    id: "inspeccion",
    title: "ITR — Inspección en Ruta",
    subtitle: "Registro de novedades durante el trayecto",
    icon: "clipboard",
    route: "/(tabs)/inspeccion" as Href,
    color: "#2e7d32",
  },
  {
    id: "reporte",
    title: "Reportes",
    subtitle: "Historial de inspecciones y novedades",
    icon: "bar-chart-2",
    route: "/(tabs)/reporte" as Href,
    color: "#6a1b9a",
  },
];

export default function HubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login" as Href);
    }
  }, [user, isLoading]);

  async function handleLogout() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/login" as Href);
  }

  async function handleModule(route: Href) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
  }

  if (isLoading || !user) return null;

  const styles = makeStyles(colors);

  return (
    <View style={[styles.root, { backgroundColor: colors.navyDark }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View>
          <Text style={styles.greeting}>
            Hola, {user.name?.split(" ")[0] ?? "Usuario"}
          </Text>
          <Text style={styles.roleLabel}>
            {user.role === "controlador"
              ? "Controlador de ruta"
              : user.role === "admin"
              ? "Administrador"
              : "Superadministrador"}
          </Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn} testID="logout-button">
          <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      <View style={styles.logoRow}>
        <View style={styles.logoSmall}>
          <Feather name="shield" size={20} color="#fff" />
        </View>
        <Text style={styles.appLabel}>SafeNode Mobile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Módulos disponibles</Text>

        {MODULES.map((mod) => (
          <Pressable
            key={mod.id}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => handleModule(mod.route)}
            testID={`module-${mod.id}`}
          >
            <View style={[styles.cardIcon, { backgroundColor: mod.color }]}>
              <Feather name={mod.icon} size={24} color="#fff" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{mod.title}</Text>
              <Text style={styles.cardSubtitle}>{mod.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Pressable>
        ))}

        <View style={styles.infoCard}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={styles.infoText}>
            Todos los registros se sincronizan automáticamente con el servidor central.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 24,
      paddingBottom: 12,
    },
    greeting: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
    },
    roleLabel: {
      fontSize: 13,
      color: "rgba(255,255,255,0.55)",
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    logoutBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    logoRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 24,
      marginBottom: 20,
      gap: 8,
    },
    logoSmall: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    appLabel: {
      fontSize: 14,
      color: "rgba(255,255,255,0.4)",
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.5,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    scrollContent: {
      padding: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
      gap: 14,
    },
    cardPressed: {
      opacity: 0.88,
    },
    cardIcon: {
      width: 50,
      height: 50,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    cardText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    cardSubtitle: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    infoCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.secondary,
      borderRadius: 12,
      padding: 14,
      gap: 10,
      marginTop: 8,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 18,
    },
  });
}
