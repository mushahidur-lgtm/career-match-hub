# Matching benchmark: baseline before Phase 2 changes

Two invented candidates. Fixtures: `tests/fixtures/benchmark/`.

37 scenarios. Rules only, no AI. These are agreement figures against hand-written labels on a small
invented set. They are **not** a measure of production performance or of hiring outcomes.

| Metric | Value |
| --- | --- |
| Precision@5 | 60% (6/10) |
| Precision@10 | 35% (7/20); at most 35% (7/20) with these labels |
| Recall of high-quality matches | 100% (7/7) |
| Ranking consistency (pairs ordered as labelled) | 88% (189/215) |
| False-positive rate (a 'no' job called a strong match) | 6% (1/17) |
| False-negative rate (an 'apply' job not called a strong match) | 0% (0/7) |
| Tier agreement | 68% (25/37) |
| Required-skill extraction, precision | 90% (111/124) |
| Required-skill extraction, recall | 100% (111/111) |
| Eligibility status accuracy | 86% (32/37) |
| Evidence level accuracy | 100% (18/18) |
| Skills wrongly reported as matched | 0% (0/21) |
| Missing mandatory qualifications reported | 0% (0/4) |
| Calibration: tier agreement at high confidence | 62% (18/29) |
| Calibration: tier agreement at medium confidence | 86% (6/7) |
| Calibration: tier agreement at low confidence | 100% (1/1) |

## Ranked too highly

- an-03 Data Engineer [learning_only]: labelled no, engine consider (score 63, rank 13)
- an-05 Business Intelligence Developer [transferable]: labelled consider, engine apply (score 85, rank 5)
- an-08 Director of Business Intelligence [seniority_mismatch]: labelled no, engine consider (score 55, rank 14)
- an-09 Junior Data Analyst [seniority_mismatch]: labelled no, engine apply (score 80, rank 7)
- an-10 Data Engineer [location_mismatch]: labelled no, engine consider (score 68, rank 10)
- an-12 Senior BI Developer [missing_mandatory]: labelled consider, engine apply (score 93, rank 1)
- dv-04 DevOps Engineer [learning_only]: labelled no, engine consider (score 51, rank 14)
- dv-05 Software Engineer [transferable]: labelled no, engine consider (score 65, rank 10)
- dv-10 Principal .NET Architect [seniority_mismatch]: labelled no, engine consider (score 70, rank 7)
- dv-11 Senior .NET Developer [location_mismatch]: labelled no, engine consider (score 69, rank 8)
- dv-13 Software Developer [missing_mandatory]: labelled consider, engine apply (score 89, rank 6)
- dv-15 Azure Cloud Developer [missing_certification]: labelled consider, engine apply (score 96, rank 2)

## Ranked too low

None.

## Skills wrongly reported as matched (including related skills treated as equivalent)

None.

## Evidence level disagreements

None.

## Missing qualifications not reported

- an-12 Senior BI Developer [missing_mandatory]: Master's degree
- an-13 Data Engineer [missing_certification]: Azure Data Engineer Associate
- dv-13 Software Developer [missing_mandatory]: Bachelor's degree
- dv-15 Azure Cloud Developer [missing_certification]: AZ-204

## Eligibility disagreements

- an-12 Senior BI Developer [missing_mandatory]: expected needs_verification, got not_applicable
- an-13 Data Engineer [missing_certification]: expected needs_verification, got not_applicable
- dv-13 Software Developer [missing_mandatory]: expected needs_verification, got not_applicable
- dv-14 Software Developer [direct]: expected eligible, got not_applicable
- dv-15 Azure Cloud Developer [missing_certification]: expected needs_verification, got not_applicable

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
