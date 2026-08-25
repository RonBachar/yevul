import { Link } from 'react-router-dom';
import { plotSummaryLine, type PlotWithCropCycle } from '@yevul/shared';
import './PlotCard.css';

// כרטיס חלקה, design.md "Plot Card". מספר הרווח שמפורט שם דורש צבירת
// הכנסה מול הוצאה בפועל שנבנית רק בשלב 4, ראה docs/open-items.md.
// עד אז הכרטיס מציג שטח, גידול ועונה בלבד, אותו תוכן בדיוק כמו בנייד.
export function PlotCard({ plot }: { plot: PlotWithCropCycle }) {
  return (
    <Link className="plot-card" to={`/plots/${plot.id}`}>
      <span className="plot-card__name">{plot.name}</span>
      <span className="plot-card__summary">{plotSummaryLine(plot, plot.cropCycle)}</span>
    </Link>
  );
}
