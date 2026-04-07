import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

interface PreCheck {
  id: string;
  categoria: string;
  label: string;
  status: "ok" | "novedad" | null;
  nota?: string;
}

const INITIAL_CHECKS: PreCheck[] = [
  { id: "m1", categoria: "Motor", label: "Nivel de aceite correcto", status: null },
  { id: "m2", categoria: "Motor", label: "Nivel de agua/refrigerante correcto", status: null },
  { id: "m3", categoria: "Motor", label: "Correa de alternador sin desgaste", status: null },
  { id: "m4", categoria: "Motor", label: "Sin fugas visibles (aceite, combustible, agua)", status: null },
  { id: "f1", categoria: "Frenos", label: "Freno de servicio (pedal firme)", status: null },
  { id: "f2", categoria: "Frenos", label: "Freno de parqueo operativo", status: null },
  { id: "f3", categoria: "Frenos", label: "Luces de freno funcionando", status: null },
  { id: "l1", categoria: "Llantas", label: "Presión de llantas correcta", status: null },
  { id: "l2", categoria: "Llantas", label: "Labrado de llantas en buen estado", status: null },
  { id: "l3", categoria: "Llantas", label: "Llanta de repuesto disponible", status: null },
  { id: "lu1", categoria: "Luces", label: "Luces delanteras (altas y bajas)", status: null },
  { id: "lu2", categoria: "Luces", label: "Luces traseras y direccionales", status: null },
  { id: "lu3", categoria: "Luces", label: "Luces de emergencia operativas", status: null },
  { id: "s1", categoria: "Seguridad", label: "Cinturones de seguridad operativos", status: null },
  { id: "s2", categoria: "Seguridad", label: "Extintor cargado y vigente", status: null },
  { id: "s3", categoria: "Seguridad", label: "Botiquín de primeros auxilios completo", status: null },
  { id: "s4", categoria: "Seguridad", label: "Chaleco reflectivo disponible", status: null },
  { id: "s5", categoria: "Seguridad", label: "Conos/triángulos de señalización", status: null },
];

const CATEGORIAS = [...new Set(INITIAL_CHECKS.map((c) => c.categoria))];

export default function PreoperacionalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [checks, setChecks] = useState<PreCheck[]>(INITIAL_CHECKS);
  const [placa, setPlaca] = useState("");
  const [conductor, setConductor] = useState("");
  const [kilometraje, setKilometraje] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [activeNota, setActiveNota] = useState<string | null>(null);

  function toggleStatus(id: string, status: "ok" | "novedad") {
    Haptics.selectionAsync();
    setChecks((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: c.status === status ? null : status } : c
      )
    );
  }

  function setNota(id: string, nota: string) {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, nota } : c)));
  }

  const pending = checks.filter((c) => c.status === null).length;
  const novedades = checks.filter((c) => c.status === "novedad").length;
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
    setChecks(INITIAL_CHECKS);
    setPlaca("");
    setConductor("");
    setKilometraje("");
    setSubmitted(false);
    setActiveNota(null);
  }

  const styles = makeStyles(colors);

  if (submitted) {
    return (
      <View style={[styles.root, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.successBox}>
          <Feather name="check-circle" size={56} color={colors.success} />
          <Text style={styles.successTitle}>¡Preoperacional Enviado!</Text>
          <Text style={styles.successText}>
            La inspección del vehículo {placa} fue registrada correctamente.
            {novedades > 0
              ? `\n⚠️ ${novedades} novedad(es) reportada(s).`
              : "\n✔ Vehículo en condiciones óptimas."}
          </Text>
          <Pressable style={styles.newBtn} onPress={handleReset}>
            <Text style={styles.newBtnText}>Nueva inspección</Text>
          </Pressable>
          <Pressable style={styles.hubBtn} onPress={() => router.replace("/(tabs)/")}>
            <Text style={styles.hubBtnText}>Ir al inicio</Text>
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
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Datos del vehículo</Text>
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
                testID="placa-pre-input"
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
                testID="conductor-pre-input"
              />
            </View>
            <View style={[styles.fieldRow, styles.fieldBorder]}>
              <Feather name="activity" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.fieldInput}
                placeholder="Kilometraje actual (km)"
                placeholderTextColor={colors.mutedForeground}
                value={kilometraje}
                onChangeText={setKilometraje}
                keyboardType="numeric"
              />
            </View>
          </View>

          {CATEGORIAS.map((cat) => {
            const catChecks = checks.filter((c) => c.categoria === cat);
            return (
              <View key={cat}>
                <Text style={styles.sectionLabel}>{cat}</Text>
                {catChecks.map((check) => (
                  <View key={check.id}>
                    <View style={styles.checkCard}>
                      <Text style={styles.checkLabel}>{check.label}</Text>
                      <View style={styles.checkBtns}>
                        <Pressable
                          style={[styles.checkBtn, check.status === "ok" && styles.checkBtnOk]}
                          onPress={() => toggleStatus(check.id, "ok")}
                          testID={`pre-ok-${check.id}`}
                        >
                          <Feather name="check" size={16} color={check.status === "ok" ? "#fff" : colors.success} />
                        </Pressable>
                        <Pressable
                          style={[styles.checkBtn, check.status === "novedad" && styles.checkBtnNovedad]}
                          onPress={() => {
                            toggleStatus(check.id, "novedad");
                            if (check.status !== "novedad") setActiveNota(check.id);
                          }}
                          testID={`pre-novedad-${check.id}`}
                        >
                          <Feather name="alert-triangle" size={16} color={check.status === "novedad" ? "#fff" : colors.warning} />
                        </Pressable>
                        <Pressable
                          style={styles.notaToggle}
                          onPress={() => setActiveNota(activeNota === check.id ? null : check.id)}
                        >
                          <Feather name="message-square" size={15} color={check.nota ? colors.primary : colors.mutedForeground} />
                        </Pressable>
                      </View>
                    </View>
                    {activeNota === check.id && (
                      <View style={styles.notaBox}>
                        <TextInput
                          style={styles.notaInput}
                          placeholder="Agregar nota..."
                          placeholderTextColor={colors.mutedForeground}
                          value={check.nota ?? ""}
                          onChangeText={(t) => setNota(check.id, t)}
                          multiline
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            );
          })}

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
            testID="submit-pre-button"
          >
            <Feather name="send" size={18} color="#fff" />
            <Text style={styles.submitText}>Enviar Preoperacional</Text>
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
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      marginBottom: 8,
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
      marginTop: 12,
      marginBottom: 24,
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 4,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnPressed: { opacity: 0.85 },
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
      fontSize: 24,
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
    hubBtn: {
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    hubBtnText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.primary,
    },
  });
}
