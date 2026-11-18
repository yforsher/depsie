// A report saved with an older report format that could not be converted is shown as saved.
export function OlderFormatNote() {
  return (
    <p className="panel hint" role="note">
      This report was saved in an older format, so some parts may not show.
    </p>
  );
}
