import { Pressable, Text, View } from 'react-native';
import { t } from '@yevul/shared';
import { formStyles } from '../theme/formStyles';

// שורת צ'יפים לבחירה מתוך קבוצה קטנה וסגורה. נולד במסך ההגדרות ועבר
// לכאן כש-PlotFormScreen נזקק לאותו רכיב בדיוק בשביל יחידת השטח,
// כדי שלא יהיו שני עותקים שיכולים להתפצל.
export function ChipField<T extends string>({
  label,
  options,
  selected,
  labelKey,
  onSelect,
  disabled,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  labelKey: (value: T) => string;
  onSelect: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <View style={formStyles.field}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={formStyles.chips}>
        {options.map((value) => {
          const active = value === selected;
          return (
            <Pressable
              key={value}
              style={[
                formStyles.chip,
                active && formStyles.chipActive,
                disabled && formStyles.chipDisabled,
              ]}
              onPress={() => onSelect(value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                {t(labelKey(value))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
