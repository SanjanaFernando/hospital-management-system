# Forecaster Step by Step

The hospital queue forecaster is implemented in `xai/forecaster.py`. It estimates the number of patients expected to arrive soon and the expected proportion of critical patients.

## 1. Read patient history

The forecaster reads historical patient records. Each record can provide:

- `admissionTime`
- `triageLevel`
- `priority`

Records without a valid admission time are ignored.

## 2. Convert priority into a triage level

The forecaster converts priority values into triage levels from 1 to 5:

| Triage level | Meaning     | Critical? |
| ------------ | ----------- | --------- |
| 1            | Critical    | Yes       |
| 2            | Emergent    | Yes       |
| 3            | Urgent      | No        |
| 4            | Semi-urgent | No        |
| 5            | Non-urgent  | No        |

A patient is considered critical when the triage level is 1 or 2.

## 3. Group patients by admission hour

The admission time is reduced to its hour of the day. For example:

```text
08:00 -> 5 arrivals
09:00 -> 8 arrivals
10:00 -> 3 arrivals
```

The forecaster maintains this information for all 24 hours.

## 4. Calculate the hourly arrival rate

For every hour, it calculates an average arrival rate:

```text
hourly arrival rate = arrivals recorded for that hour / estimated observed days
```

The current implementation estimates observed days from the number of distinct hours found in the history. If there is no usable history, it uses a default rate of `0.5` patients per hour.

## 5. Calculate the hourly critical-patient share

For each hour, it calculates:

```text
critical share = critical arrivals / total arrivals
```

If an hour has no historical arrivals, the default critical share is `0.20`.

## 6. Select the prediction horizon

The default prediction horizon is six hours. The horizon can be configured through `forecasterHorizonHours`.

For example, if the current hour is 10:00, the forecaster examines:

```text
10:00, 11:00, 12:00, 13:00, 14:00, 15:00
```

## 7. Estimate future arrivals

The hourly rates for the prediction window are added together:

```text
expected arrivals =
  rate[10] + rate[11] + rate[12]
  + rate[13] + rate[14] + rate[15]
```

This produces the expected number of arrivals during the next six hours.

## 8. Normalize the predicted load

The expected arrivals are converted to a value between 0 and 1:

```text
predicted load = expected arrivals / maximum expected arrivals
```

The result is capped at `1.0`.

This value is returned as `pred_load`.

## 9. Estimate the future critical share

The critical-patient shares for the prediction window are averaged:

```text
predicted critical share =
average of the hourly critical shares
```

This value is returned as `pred_crit`.

## 10. Detect a predicted surge

A critical-arrival surge is predicted only when both conditions are true:

```text
pred_load > 0.347
AND
pred_crit > 0.436
```

If both conditions pass, `surge_predicted` is set to `true`.

## 11. Calculate expected critical patients

The inference service derives the expected number of critical patients using:

```text
expected critical patients =
  expected arrivals * predicted critical share
```

This value is displayed to the user but is not calculated directly by `ArrivalForecaster.predict_details()`.

## 12. Return the forecast

The forecaster returns:

```json
{
  "pred_load": 0.42,
  "pred_crit": 0.51,
  "expected_arrivals": 8.4,
  "horizon_hours": 6
}
```

The surrounding inference code adds:

```json
{
  "expected_critical_patients": 4.28,
  "surge_predicted": true
}
```

## Data source priority

The system uses data sources in this order:

1. Live `patientHistory`, when available.
2. The precomputed profile in `xai/config/forecaster_profile.json`.
3. Default hourly rates and critical shares if neither source is available.

The profile can be regenerated from a patient CSV with:

```bash
python xai/scripts/build_forecaster_profile.py --csv path/to/patients.csv
```

## Important limitation

This is a historical hourly-pattern forecaster. It is not a separate deep-learning arrival-prediction network. It predicts future demand by reusing historical arrival and critical-patient patterns for the current time of day.
