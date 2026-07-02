// Airbnb-style range picker. All date logic lives (tested) in lib/dates; this
// file is only layout + selection state routed through selectDay.
import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import {
  monthGrid, monthLabel, nextMonth, prevMonth, selectDay, isInRange,
  inclusiveDayCount, todayISO, type PartialRange,
} from "../../lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function RangeCalendar({ value, onChange, minDate = todayISO() }: {
  value: PartialRange; onChange: (next: PartialRange) => void; minDate?: string;
}) {
  const seed = value.start ?? minDate;
  const [ym, setYm] = useState<[number, number]>([Number(seed.slice(0, 4)), Number(seed.slice(5, 7)) - 1]);
  const [y, m] = ym;
  const weeks = monthGrid(y, m);
  const today = todayISO();
  const count = value.start && value.end ? inclusiveDayCount(value.start, value.end) : 0;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between mb-1">
        <Pressable hitSlop={8} onPress={() => setYm(prevMonth(y, m))} className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center">
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <Text variant="heading">{monthLabel(y, m)}</Text>
        <Pressable hitSlop={8} onPress={() => setYm(nextMonth(y, m))} className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center">
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((d, i) => (
          <View key={i} className="flex-1 items-center">
            <Text variant="label" className="text-ink-muted">{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day, di) =>
            day ? (
              <DayCell key={day} day={day} value={value} minDate={minDate} today={today} onPress={() => onChange(selectDay(value, day))} />
            ) : (
              <View key={`e${wi}-${di}`} className="flex-1 h-11" />
            ),
          )}
        </View>
      ))}
      {count > 0 ? (
        <View className="self-center px-4 py-1.5 rounded-pill bg-accent-soft mt-1">
          <Text variant="label" className="text-accent">{count === 1 ? "1 day" : `${count} days`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DayCell({ day, value, minDate, today, onPress }: {
  day: string; value: PartialRange; minDate: string; today: string; onPress: () => void;
}) {
  const disabled = day < minDate;
  const isStart = day === value.start;
  const isEnd = day === value.end;
  const hasRange = !!value.start && !!value.end;
  const band = isInRange(day, value)
    ? "bg-accent-soft"
    : hasRange && isStart && !isEnd ? "bg-accent-soft rounded-l-pill"
    : hasRange && isEnd && !isStart ? "bg-accent-soft rounded-r-pill"
    : "";
  return (
    <Pressable disabled={disabled} onPress={onPress} className={`flex-1 h-11 items-center justify-center ${band}`}>
      <View className={`w-9 h-9 rounded-pill items-center justify-center ${isStart || isEnd ? "bg-accent" : day === today ? "border border-accent" : ""}`}>
        <Text variant="label" className={disabled ? "text-ink-muted opacity-40" : isStart || isEnd ? "text-ink-inverse" : "text-ink"}>
          {Number(day.slice(8, 10))}
        </Text>
      </View>
    </Pressable>
  );
}
