# Matching benchmark

Two invented candidates. Fixtures: `tests/fixtures/benchmark/`.

37 scenarios. Rules only, no AI. These are agreement figures against hand-written labels on a small
invented set. They are **not** a measure of production performance or of hiring outcomes.

| Metric | Value |
| --- | --- |
| Precision@5 | 70% (7/10) |
| Precision@10 | 35% (7/20); at most 35% (7/20) with these labels |
| Recall of high-quality matches | 100% (7/7) |
| Ranking consistency (pairs ordered as labelled) | 79% (170/215) |
| False-positive rate (a 'no' job called a strong match) | 6% (1/17) |
| False-negative rate (an 'apply' job not called a strong match) | 0% (0/7) |
| Tier agreement | 76% (28/37) |
| Required-skill extraction, precision | 90% (111/124) |
| Required-skill extraction, recall | 100% (111/111) |
| Eligibility status accuracy | 100% (37/37) |
| Evidence level accuracy | 100% (18/18) |
| Skills wrongly reported as matched | 0% (0/21) |
| Missing mandatory qualifications reported | 100% (4/4) |
| Calibration: tier agreement at high confidence | 69% (20/29) |
| Calibration: tier agreement at medium confidence | 100% (7/7) |
| Calibration: tier agreement at low confidence | 100% (1/1) |

## Ranked too highly

- an-03 Data Engineer [learning_only]: labelled no, engine consider (score 63, rank 11)
- an-05 Business Intelligence Developer [transferable]: labelled consider, engine apply (score 85, rank 4)
- an-08 Director of Business Intelligence [seniority_mismatch]: labelled no, engine consider (score 55, rank 12)
- an-09 Junior Data Analyst [seniority_mismatch]: labelled no, engine apply (score 80, rank 6)
- an-10 Data Engineer [location_mismatch]: labelled no, engine consider (score 68, rank 8)
- dv-04 DevOps Engineer [learning_only]: labelled no, engine consider (score 51, rank 12)
- dv-05 Software Engineer [transferable]: labelled no, engine consider (score 65, rank 8)
- dv-10 Principal .NET Architect [seniority_mismatch]: labelled no, engine consider (score 70, rank 5)
- dv-11 Senior .NET Developer [location_mismatch]: labelled no, engine consider (score 69, rank 6)

## Ranked too low

None.

## Skills wrongly reported as matched (including related skills treated as equivalent)

None.

## Evidence level disagreements

None.

## Missing qualifications not reported

None.

## Eligibility disagreements

None.

## Required-skill extraction disagreements

- an-01 BI Developer [direct]: extra T-SQL, SQL Server.
- an-02 Data Engineer [strong_some_missing]: extra Azure.
- an-04 Azure Data Engineer [adjacent_professional]: extra Azure.
- an-06 Machine Learning Engineer [keyword_overlap]: extra Machine learning.
- an-10 Data Engineer [location_mismatch]: extra Azure.
- an-13 Data Engineer [missing_certification]: extra Azure.
- dv-01 Senior .NET Developer [direct]: extra SQL.
- dv-02 Azure Developer [strong_some_missing]: extra CI/CD.
- dv-07 Data Engineer [career_transition]: extra Azure.
- dv-11 Senior .NET Developer [location_mismatch]: extra SQL.
- dv-14 Software Developer [direct]: extra REST APIs.
- dv-18 Senior .NET Developer [expired]: extra SQL.
