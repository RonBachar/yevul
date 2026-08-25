import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { isCustomYieldUnit, t, yieldUnitPresets } from '@yevul/shared';
import { colors } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';

// בחירת יחידת יבול. הופיעה כשדה טקסט חופשי בשלושה מקומות שונים
// (עריכת גידול, עדכון צפי, ובווב פעמיים), ולכן עברה לרכיב אחד.
//
// **הצעות ולא רשימה סגורה.** העמודה במסד היא טקסט חופשי בכוונה, ולכן
// "אחר" תמיד זמין ופותח שדה הקלדה. ערך שנשמר לפני שההצעות היו קיימות,
// או יחידה חריגה, נפתח אוטומטית במצב "אחר" עם הערך בתוכו ולא נמחק.
export function YieldUnitField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const presets = yieldUnitPresets();
  // מצב "אחר" נדבק ברגע שנבחר, גם כשהשדה עדיין ריק. בלי זה, לחיצה על
  // "אחר" הייתה מקפיצה את הבחירה חזרה כי הערך הריק לא נחשב מותאם.
  const [otherSticky, setOtherSticky] = useState(() => isCustomYieldUnit(value));
  const isOther = otherSticky || isCustomYieldUnit(value);

  function selectPreset(preset: string) {
    setOtherSticky(false);
    onChange(preset);
  }

  function selectOther() {
    setOtherSticky(true);
    // הערך הקודם נמחק רק אם הוא היה אחת ההצעות. יחידה מותאמת שכבר
    // הוקלדה נשארת, כדי שלחיצה על "אחר" לא תמחק מה שכבר נכתב.
    if (!isCustomYieldUnit(value)) onChange('');
  }

  return (
    <View style={formStyles.field}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={formStyles.chips}>
        {presets.map((preset) => {
          const active = !isOther && value.trim() === preset;
          return (
            <Pressable
              key={preset}
              style={[
                formStyles.chip,
                active && formStyles.chipActive,
                disabled && formStyles.chipDisabled,
              ]}
              onPress={() => selectPreset(preset)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                {preset}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[
            formStyles.chip,
            isOther && formStyles.chipActive,
            disabled && formStyles.chipDisabled,
          ]}
          onPress={selectOther}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ selected: isOther, disabled }}
        >
          <Text style={[formStyles.chipText, isOther && formStyles.chipTextActive]}>
            {t('common.other')}
          </Text>
        </Pressable>
      </View>

      {isOther && (
        <TextInput
          style={formStyles.input}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          placeholder={t('plots.crop.yieldUnitPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
          autoFocus
        />
      )}
    </View>
  );
}
