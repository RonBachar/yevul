import { Pressable, Text, View } from 'react-native';
import { parseYieldUnit, yieldUnitLabel, YIELD_UNITS } from '@yevul/shared';
import { formStyles } from '../theme/formStyles';

// בחירת יחידה, גם ליבול וגם למחיר. משמש בעריכת החלקה ובעדכון הצפי,
// ומקביל ל-YieldUnitField של הווב. צ'יפים בנייד, תפריט נפתח בווב.
//
// **שלוש יחידות בלבד: קילו, טון, יחידה. אין "אחר" ואין טקסט חופשי.**
// זו החלטת מוצר, והיא מה שמאפשר לאפליקציה להמיר בין יבול למחיר במקום
// להכפיל טונות בשקלים לקילו. הרשימה הישנה כללה גם "ארגזים", שאינו
// משקל ואינו ספירה ולכן לא ניתן להמרה כלל.
//
// **ערך ישן שאינו אחת מהשלוש מוצג כצ'יפ משלו ולא נמחק.** שורה שנכתבה
// לפני השינוי עם "ארגזים" תמשיך להראות "ארגזים" עד שהחקלאי יבחר אחרת.
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
  const canonical = parseYieldUnit(value);
  const trimmed = value.trim();
  // ערך שמור שאינו נפתר לאחת מהשלוש, נשמר כצ'יפ כדי שרינדור לבדו לא
  // ידרוס אותו.
  const legacy = trimmed !== '' && canonical === null ? trimmed : null;

  const options: { value: string; label: string }[] = [
    ...YIELD_UNITS.map((unit) => ({ value: unit, label: yieldUnitLabel(unit) })),
    ...(legacy ? [{ value: legacy, label: legacy }] : []),
  ];

  return (
    <View style={formStyles.field}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={formStyles.chips}>
        {options.map((option) => {
          const active = (canonical ?? legacy ?? '') === option.value;
          return (
            <Pressable
              key={option.value}
              style={[
                formStyles.chip,
                active && formStyles.chipActive,
                disabled && formStyles.chipDisabled,
              ]}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
