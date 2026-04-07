import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
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

import { AppColors } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

interface CheckItem {
  id: string;
  label: string;
  status: "ok" | "novedad" | null;
  nota?: string;
}

const INITIAL_ITEMS: CheckItem[] = [
  { id: "1", label: "Documentos del vehículo vigentes", status: null },
  { id: "2", label: "Licencia de conducción del conductor", status: null },
  { id: "3", label: "Seguro SOAT vigente", status: null },
  { id: "4", label: "Revisión técnico-mecánica vigente", status: null },
  { id: "5", label: "Manifiesto de carga diligenciado", status: null },
  { id: "6", label: "GPS activo y funcionando", status: null },
  { id: "7", label: "Comunicación con central operativa", status: null },
  { id: "8", label: "Botiquín y extintor disponibles", status: null },
  { id: "9", label: "Señales de carretera (triángulos/conos)", status: null },
  { id: "10", label: "Candados y precintos de seguridad en orden", status: null },
];

export default function InspeccionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CheckItem[]>(INITIAL_ITEMS);
  const [placa, setPlaca] = useState("");
  const [conductor, setConductor] = useState("");
  const [ruta, setRuta] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [activeNota, setActiveNota] = useState<string | null>(null);

  function toggleStatus(id: string, status: "ok" | "novedad") {
    Haptics.selectionAsync();
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: item.status === status ? null : status }
          : item
      )
    );
  }

  function setNota(id: string, nota: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, nota } : item))
    );
  }

  const pending = items.filter((i) => i.status === null).length;
  const novedades = items.filter((i) => i.status === "novedad").length;
  const completado = pending === 0;

  async function handleSubmit() {
    if (!placa.trim() || !conductor.trim()) {
      Alert.alert("Campos requeridos", "Por favor ingresa la placa y el nombre del conductor.");
      return;
    }
    if (!completado) {
      Alert.alert("Inspección incompleta", `Faltan ${pending} ítems por revisar.`);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
  }

  function handleReset() {
    setItems(INITIAL_ITEMS);
    setPlaca("");
    setConductor("");
    setRuta("");
    setSubmitted(false);
    setActiveNota(null);
  }

  const styles = makeStyles(colors);

  if (submitted) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.successBox}>
          <Feather name="check-circle" size={56} color={colors.success} />
          <Text style={styles.successTitle}>¡ITR Enviado!</Text>
          <Text style={styles.successText}>
            La inspección en ruta fue registrada correctamente.
            {novedades > 0 ? `\n⚠️ ${novedades} novedad(es) reportada(s).` : "\n✔ Sin novedades."}
          </Text>
          <Pressable style={styles.newBtn} onPress={handleReset}>
            <Text style={styles.newBtnText}>Nueva inspección</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>ITR — Inspección en Ruta</Text>
          <View style={[styles.badge, completado ? styles.badgeOk : styles.badgePending]}>
            <Text style={styles.badgeText}>
              {completado ? "Completo" : `${pending} pendientes`}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Datos del despacho</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Feather name="truck" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.fieldInput}
                placeholder="Placa del vehículo *"
                placeholderTextColor={colors.mutedForeground}
                value={placa}
                onChangeText={setPlaca}
                autoCapitalize="characters"
                testID="placa-input"
              />
            </View>
            <View style={[styles.fieldRow, styles.fieldBorder]}>
              <Feather name="user" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.fieldInput}
                placeholder="Nombre del conductor *"
                placeholderTextColor={colors.mutedForeground}
                value={conductor}
                onChangeText={setConductor}
                testID="conductor-input"
              />
            </View>
            <View style={[styles.fieldRow, styles.fieldBorder]}>
              <Feather name="map-pin" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.fieldInput}
                placeholder="Ruta / tramo (opcional)"
                placeholderTextColor={colors.mutedForeground}
                value={ruta}
                onChangeText={setRuta}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Lista de verificación</Text>

          {items.map((item) => (
            <View key={item.id}>
              <View style={styles.checkCard}>
                <Text style={styles.checkLabel}>{item.label}</Text>
                <View style={styles.checkBtns}>
                  <Pressable
                    style={[styles.checkBtn, item.status === "ok" && styles.checkBtnOk]}
                    onPress={() => toggleStatus(item.id, "ok")}
                    testID={`check-ok-${item.id}`}
                  >
                    <Feather name="check" size={16} color={item.status === "ok" ? "#fff" : colors.success} />
                  </Pressable>
                  <Pressable
                    style={[styles.checkBtn, item.status === "novedad" && styles.checkBtnNovedad]}
                    onPress={() => {
                      toggleStatus(item.id, "novedad");
                      if (item.status !== "novedad") setActiveNota(item.id);
                    }}
                    testID={`check-novedad-${item.id}`}
                  >
                    <Feather name="alert-triangle" size={16} color={item.status === "novedad" ? "#fff" : colors.warning} />
                  </Pressable>
                  <Pressable
                    style={styles.notaToggle}
                    onPress={() => setActiveNota(activeNota === item.id ? null : item.id)}
                  >
                    <Feather name="message-square" size={15} color={item.nota ? colors.primary : colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>
              {activeNota === item.id && (
                <View style={styles.notaBox}>
                  <TextInput
                    style={styles.notaInput}
                    placeholder="Agregar nota..."
                    placeholderTextColor={colors.mutedForeground}
                    value={item.nota ?? ""}
                    onChangeText={(t) => setNota(item.id, t)}
                    multiline
                  />
                </View>
              )}
            </View>
          ))}

          {novedades > 0 && (
            <View style={styles.novedadSummary}>
              <Feather name="alert-circle" size={16} color={colors.warning} />
              <Text style={styles.novedadText}>{novedades} novedad(es) registrada(s)</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              !completado && styles.submitBtnDisabled,
              pressed && styles.submitBtnPressed,
            ]}
            onPress={handleSubmit}
            testID="submit-itr-button"
          >
            <Feather name="send" size={18} color="#fff" />
            <Text style={styles.submitText}>Enviar ITR</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    screenTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    badge: {
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeOk: { backgroundColor: colors.successLight },
    badgePending: { backgroundColor: colors.warningLight },
    badgeText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    content: {
      padding: 16,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      marginBottom: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      height: 48,
      gap: 10,
    },
    fieldBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    fieldInput: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    checkCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 6,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    },
    checkLabel: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 18,
      marginRight: 8,
    },
    checkBtns: {
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
    },
    checkBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkBtnOk: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    checkBtnNovedad: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    notaToggle: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    },
    notaBox: {
      backgroundColor: colors.secondary,
      borderRadius: 10,
      padding: 10,
      marginBottom: 6,
      marginHorizontal: 2,
    },
    notaInput: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      minHeight: 48,
    },
    novedadSummary: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warningLight,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    novedadText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.warning,
    },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 4,
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitBtnPressed: {
      opacity: 0.85,
    },
    submitText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    successBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 16,
    },
    successTitle: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.success,
    },
    successText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 22,
    },
    newBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 14,
      marginTop: 8,
    },
    newBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
  });
}
