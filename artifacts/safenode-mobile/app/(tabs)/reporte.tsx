import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppColors } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

interface ReporteItem {
  id: string;
  tipo: "ITR" | "Preoperacional";
  placa: string;
  conductor: string;
  fecha: string;
  hora: string;
  novedades: number;
  estado: "OK" | "Con novedades";
}

const DEMO_REPORTES: ReporteItem[] = [
  {
    id: "1",
    tipo: "Preoperacional",
    placa: "ABC 123",
    conductor: "Carlos Martínez",
    fecha: "07/04/2026",
    hora: "06:30",
    novedades: 0,
    estado: "OK",
  },
  {
    id: "2",
    tipo: "ITR",
    placa: "XYZ 789",
    conductor: "Ana Gómez",
    fecha: "07/04/2026",
    hora: "09:15",
    novedades: 2,
    estado: "Con novedades",
  },
  {
    id: "3",
    tipo: "Preoperacional",
    placa: "DEF 456",
    conductor: "Luis Torres",
    fecha: "06/04/2026",
    hora: "07:00",
    novedades: 1,
    estado: "Con novedades",
  },
  {
    id: "4",
    tipo: "ITR",
    placa: "GHI 321",
    conductor: "María López",
    fecha: "05/04/2026",
    hora: "11:45",
    novedades: 0,
    estado: "OK",
  },
  {
    id: "5",
    tipo: "Preoperacional",
    placa: "JKL 654",
    conductor: "Javier Herrera",
    fecha: "05/04/2026",
    hora: "05:50",
    novedades: 3,
    estado: "Con novedades",
  },
];

type FilterType = "all" | "ITR" | "Preoperacional";

export default function ReporteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered =
    filter === "all"
      ? DEMO_REPORTES
      : DEMO_REPORTES.filter((r) => r.tipo === filter);

  const styles = makeStyles(colors);

  function renderItem({ item }: { item: ReporteItem }) {
    const isOk = item.estado === "OK";
    return (
      <View style={styles.reportCard}>
        <View style={styles.reportTop}>
          <View style={[styles.tipoBadge, item.tipo === "ITR" ? styles.tipoITR : styles.tipoPre]}>
            <Text style={styles.tipoText}>{item.tipo}</Text>
          </View>
          <View style={[styles.estadoBadge, isOk ? styles.estadoOk : styles.estadoNovedad]}>
            <Feather
              name={isOk ? "check-circle" : "alert-circle"}
              size={12}
              color={isOk ? colors.success : colors.warning}
            />
            <Text style={[styles.estadoText, isOk ? styles.estadoTextOk : styles.estadoTextNovedad]}>
              {item.estado}
            </Text>
          </View>
        </View>
        <View style={styles.reportMain}>
          <Feather name="truck" size={14} color={colors.mutedForeground} />
          <Text style={styles.placa}>{item.placa}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.conductor}>{item.conductor}</Text>
        </View>
        <View style={styles.reportMeta}>
          <Feather name="calendar" size={12} color={colors.mutedForeground} />
          <Text style={styles.metaText}>{item.fecha} — {item.hora}</Text>
          {item.novedades > 0 && (
            <>
              <Text style={styles.dot}>·</Text>
              <Feather name="alert-triangle" size={12} color={colors.warning} />
              <Text style={styles.novedadCount}>{item.novedades} novedad(es)</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>Historial de inspecciones</Text>

      <View style={styles.filterRow}>
        {(["all", "ITR", "Preoperacional"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
            testID={`filter-${f}`}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "Todos" : f}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>Sin reportes disponibles</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    filterRow: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 8,
      marginBottom: 12,
    },
    filterBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.muted,
    },
    filterBtnActive: {
      backgroundColor: colors.primary,
    },
    filterText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    filterTextActive: {
      color: "#fff",
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    reportCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    reportTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    tipoBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tipoITR: { backgroundColor: "#e3f2fd" },
    tipoPre: { backgroundColor: "#e8f5e9" },
    tipoText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    estadoBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    estadoOk: { backgroundColor: colors.successLight },
    estadoNovedad: { backgroundColor: colors.warningLight },
    estadoText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
    },
    estadoTextOk: { color: colors.success },
    estadoTextNovedad: { color: colors.warning },
    reportMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    placa: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    dot: {
      color: colors.mutedForeground,
    },
    conductor: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
    },
    reportMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    metaText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    novedadCount: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.warning,
    },
    emptyState: {
      alignItems: "center",
      paddingTop: 60,
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
}
