# Human-authored real-data analysis answer key

This file maps each prompt in questions.md to the original ScienceAgentBench evaluation assets. Test executors must not read it while running the prompts.

## Evaluation scale

- Pass: the original ScienceAgentBench evaluator accepts the required output produced from the official task data.
- Partial: the required artifact exists and addresses the verbatim task, but it does not fully satisfy the original evaluator.
- Fail: the output is absent or invalid, the task or dataset was substituted, or the executor accessed this answer key.

Use the original benchmark evaluator as the authority. This file does not introduce new analytical requirements or claim a fixed narrative answer.

## 1. ScienceAgentBench instance 1: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 0](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=0)
- Required output: pred_results/clintox_test_pred.csv
- Gold program: clintox_nn.py
- Evaluator: clintox_nn_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 2. ScienceAgentBench instance 2: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 1](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=1)
- Required output: pred_results/mat_diffusion_features.csv
- Gold program: mat_feature_select.py
- Evaluator: eval_mat_feature_select.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 3. ScienceAgentBench instance 3: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 2](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=2)
- Required output: pred_results/compound_bulk_modulus.csv
- Gold program: predict_bulk_modulus.py
- Evaluator: eval_bulk_modulus.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 4. ScienceAgentBench instance 4: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 3](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=3)
- Required output: pred_results/Elk_Analysis.png
- Gold program: elk_new.py
- Evaluator: eval_elk_analysis.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 5. ScienceAgentBench instance 5: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 4](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=4)
- Required output: pred_results/dkpes_test_pred.csv
- Gold program: dkpes_model_development_1.py
- Evaluator: eval_dkpes_model_development_1.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 6. ScienceAgentBench instance 6: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 5](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=5)
- Required output: pred_results/dkpes_molecular_analysis_pred.png
- Gold program: dkpes_visualization_1.py
- Evaluator: eval_dkpes_visualization_1.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 7. ScienceAgentBench instance 7: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 6](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=6)
- Required output: pred_results/dkpes_molecular_activity_analysis_pred.png
- Gold program: dkpes_visualization_2.py
- Evaluator: eval_dkpes_visualization_2.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 8. ScienceAgentBench instance 8: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 7](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=7)
- Required output: pred_results/dkpes_feature_selection_analysis_pred.png
- Gold program: dkpes_visualization_3.py
- Evaluator: eval_dkpes_visualization_3.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 9. ScienceAgentBench instance 9: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 8](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=8)
- Required output: pred_results/Factors_correlations.png
- Gold program: FACTORS_correlations.py
- Evaluator: FACTORS_correlations_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 10. ScienceAgentBench instance 10: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 9](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=9)
- Required output: pred_results/Fire_Service_Analysis.png
- Gold program: toronto_new.py
- Evaluator: eval_toronto_fire.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 11. ScienceAgentBench instance 11: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 10](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=10)
- Required output: pred_results/cell-count_pred.csv
- Gold program: BBBC002_cell-count.py
- Evaluator: BBBC002_cell_count_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 12. ScienceAgentBench instance 12: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 11](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=11)
- Required output: pred_results/davis_dti_repurposing.txt
- Gold program: davis_dti.py
- Evaluator: davis_dti_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 13. ScienceAgentBench instance 13: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 12](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=12)
- Required output: pred_results/hiv_test_pred.csv
- Gold program: drug_property_model.py
- Evaluator: drug_property_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 14. ScienceAgentBench instance 14: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 13](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=13)
- Required output: pred_results/flooding_analysis.png
- Gold program: flooding_gpd.py
- Evaluator: eval_flooding_gpd.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 15. ScienceAgentBench instance 15: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 14](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=14)
- Required output: pred_results/aai_preds.csv
- Gold program: aai.py
- Evaluator: admet_ai_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 16. ScienceAgentBench instance 16: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 15](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=15)
- Required output: pred_results/compound_filter_results.txt
- Gold program: compound_filter.py
- Evaluator: antibioticsai_filter_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 17. ScienceAgentBench instance 17: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 16](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=16)
- Required output: pred_results/drugex_vis_pred.png
- Gold program: drugex_vis.py
- Evaluator: drugex_vis_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 18. ScienceAgentBench instance 18: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 17](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=17)
- Required output: pred_results/MCNC_RF.csv
- Gold program: DILI_models_ECFP_RF.py
- Evaluator: eval_DILI_RF.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 19. ScienceAgentBench instance 19: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 18](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=18)
- Required output: pred_results/MCNC_SVM.csv
- Gold program: DILI_models_ECFP_SVM.py
- Evaluator: eval_DILI_SVM.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 20. ScienceAgentBench instance 20: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 19](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=19)
- Required output: pred_results/tdc_results_visualization.png
- Gold program: tdc_visualization.py
- Evaluator: eval_tdc_visualization.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 21. ScienceAgentBench instance 21: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 20](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=20)
- Required output: pred_results/deforestation_rate.csv
- Gold program: deforestation.py
- Evaluator: eval_deforestation.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 22. ScienceAgentBench instance 22: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 21](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=21)
- Required output: pred_results/papyrus_filtered.pkl
- Gold program: papyrus_filtering.py
- Evaluator: eval_papyrus.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 23. ScienceAgentBench instance 23: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 22](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=22)
- Required output: pred_results/predictedRiskyArea.png
- Gold program: deforestation_predict.py
- Evaluator: eval_deforestation_predict.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 24. ScienceAgentBench instance 24: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 23](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=23)
- Required output: pred_results/ecg_processing_vis1_pred_result.png
- Gold program: ecg_processing_vis1.py
- Evaluator: eval_biopsykit_ecg_processing_vis1.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 25. ScienceAgentBench instance 25: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 24](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=24)
- Required output: pred_results/ecg_processing_vis2_pred_result.png
- Gold program: ecg_processing_vis2.py
- Evaluator: eval_biopsykit_ecg_processing_vis2.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 26. ScienceAgentBench instance 26: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 25](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=25)
- Required output: pred_results/ligand_fingerprint_pred.csv
- Gold program: ligand_fingerprint.py
- Evaluator: eval_fingerprint.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 27. ScienceAgentBench instance 27: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 26](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=26)
- Required output: pred_results/similarity_plot.png
- Gold program: generate_plot_similarity.py
- Evaluator: eval_plots_similarity.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 28. ScienceAgentBench instance 28: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 27](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=27)
- Required output: pred_results/charge_density_difference.png
- Gold program: charge_density_difference.py
- Evaluator: eval_pymatgen_charge_density_difference.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 29. ScienceAgentBench instance 29: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 28](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=28)
- Required output: pred_results/bio_eventrelated_100hz_analysis_pred.csv
- Gold program: bio_eventrelated_analyze.py
- Evaluator: eval_bio_eventrelated_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 30. ScienceAgentBench instance 30: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 29](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=29)
- Required output: pred_results/phonon_bandstructure.png
- Gold program: plot_phonon_band_structure.py
- Evaluator: eval_pymatgen_plot_phonon_band_structure.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 31. ScienceAgentBench instance 31: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 30](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=30)
- Required output: pred_results/phonon_dos.png
- Gold program: plot_phonon_dos.py
- Evaluator: eval_pymatgen_plot_phonon_dos.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 32. ScienceAgentBench instance 32: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 31](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=31)
- Required output: pred_results/CoralandSponge.png
- Gold program: coral_sponge.py
- Evaluator: coral_sponge_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 33. ScienceAgentBench instance 33: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 32](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=32)
- Required output: pred_results/transit_access.png
- Gold program: transit_access.py
- Evaluator: transit_access_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 34. ScienceAgentBench instance 34: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 33](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=33)
- Required output: pred_results/hrv_analysis_pred.csv
- Gold program: HRV_analyze.py
- Evaluator: eval_HRV_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 35. ScienceAgentBench instance 35: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 34](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=34)
- Required output: pred_results/rrv_analysis_pred.csv
- Gold program: RRV_analyze.py
- Evaluator: eval_RRV_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 36. ScienceAgentBench instance 36: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 35](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=35)
- Required output: pred_results/eeg_processing_vis1_pred.png
- Gold program: eeg_processing_vis1.py
- Evaluator: eval_biopsykit_eeg_processing_vis1.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 37. ScienceAgentBench instance 37: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 36](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=36)
- Required output: pred_results/cft_pred_results.json
- Gold program: cft.py
- Evaluator: eval_biopsykit_cft.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 38. ScienceAgentBench instance 38: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 37](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=37)
- Required output: pred_results/ligand_similarity_pred.png
- Gold program: fingerprint_similarity_vis.py
- Evaluator: fingerprint_similarity_vis_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 39. ScienceAgentBench instance 39: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 38](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=38)
- Required output: pred_results/protein_protein_similarity_pred.png
- Gold program: protein_protein_fingerprint_similarity_vis.py
- Evaluator: protein_protein_fingerprint_similarity_vis_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 40. ScienceAgentBench instance 40: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 39](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=39)
- Required output: pred_results/MD_MCNC_RF.csv
- Gold program: MD_RF.py
- Evaluator: eval_MD_RF.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 41. ScienceAgentBench instance 41: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 40](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=40)
- Required output: pred_results/MD_MCNC_KNN.csv
- Gold program: MD_KNN.py
- Evaluator: eval_MD_KNN.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 42. ScienceAgentBench instance 42: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 41](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=41)
- Required output: pred_results/EDR_analyze_pred.png
- Gold program: EDR_analyze.py
- Evaluator: eval_EDR_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 43. ScienceAgentBench instance 43: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 42](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=42)
- Required output: pred_results/EOG_analyze_pred.png
- Gold program: EOG_analyze.py
- Evaluator: eval_EOG_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 44. ScienceAgentBench instance 44: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 43](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=43)
- Required output: pred_results/imu_pred.json
- Gold program: imu.py
- Evaluator: biopsykit_imu_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 45. ScienceAgentBench instance 45: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 44](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=44)
- Required output: pred_results/questionnaire_pred.csv
- Gold program: questionnaire.py
- Evaluator: biopsykit_questionnaire_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 46. ScienceAgentBench instance 46: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 45](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=45)
- Required output: pred_results/ruggedness.png
- Gold program: mountainLion1.py
- Evaluator: mountainLion1_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 47. ScienceAgentBench instance 47: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 46](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=46)
- Required output: pred_results/distance_to_habitat.png
- Gold program: mountainLion2.py
- Evaluator: mountainLion2_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 48. ScienceAgentBench instance 48: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 47](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=47)
- Required output: pred_results/sst_visualization_pred.png
- Gold program: sst_visualization.py
- Evaluator: eval_sst_visualization.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 49. ScienceAgentBench instance 49: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 48](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=48)
- Required output: pred_results/EOF_standard.png
- Gold program: EOF_standard_hgt_plot.py
- Evaluator: EOF_standard_hgt_plot_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 50. ScienceAgentBench instance 50: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 49](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=49)
- Required output: pred_results/EOF_xarray_sst.png
- Gold program: EOF_xarray_sst_plot.py
- Evaluator: EOF_xarray_sst_plot_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 51. ScienceAgentBench instance 51: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 50](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=50)
- Required output: pred_results/brain_blood_qsar.csv
- Gold program: brain_blood_qsar.py
- Evaluator: eval_brain_blood_qsar.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 52. ScienceAgentBench instance 52: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 51](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=51)
- Required output: pred_results/aquatic_toxicity_qsar_vis.png
- Gold program: aquatic_toxicity_qsar_vis.py
- Evaluator: eval_aquatic_toxicity_qsar_vis.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 53. ScienceAgentBench instance 53: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 52](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=52)
- Required output: pred_results/landCover_reclassified.tif
- Gold program: mountainLion3.py
- Evaluator: mountainLion3_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 54. ScienceAgentBench instance 54: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 53](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=53)
- Required output: pred_results/mountainLionCorridor.png
- Gold program: mountainLionCorridor.py
- Evaluator: mountainLionCorridor_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 55. ScienceAgentBench instance 55: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 54](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=54)
- Required output: pred_results/ocean_profiles_vis.png
- Gold program: plot_ocean_profiles.py
- Evaluator: eval_plot_ocean_profiles.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 56. ScienceAgentBench instance 56: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 55](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=55)
- Required output: pred_results/temperature_statistic_vis.png
- Gold program: plot_temperature_statistic.py
- Evaluator: eval_plot_temperature_statistic.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 57. ScienceAgentBench instance 57: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 56](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=56)
- Required output: pred_results/indiv_table.png
- Gold program: nvc_plot_ind.py
- Evaluator: eval_syllogistic_nvc_plot_ind.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 58. ScienceAgentBench instance 58: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 57](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=57)
- Required output: pred_results/individuals.csv
- Gold program: nvc_gen_ind.py
- Evaluator: eval_syllogistic_nvc_gen_ind.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 59. ScienceAgentBench instance 59: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 58](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=58)
- Required output: pred_results/nvc_heatmap.png
- Gold program: nvc_heatmap.py
- Evaluator: eval_syllogistic_nvc_heatmap.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 60. ScienceAgentBench instance 60: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 59](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=59)
- Required output: pred_results/accuracies.csv
- Gold program: nvc_accuracies.py
- Evaluator: eval_syllogistic_nvc_accuracies.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 61. ScienceAgentBench instance 61: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 60](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=60)
- Required output: pred_results/stackedbar_plain_prediction.png
- Gold program: nvc_stackbar_plain_prediction.py
- Evaluator: eval_syllogistic_nvc_stackbar_plain_prediction.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 62. ScienceAgentBench instance 62: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 61](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=61)
- Required output: pred_results/stackedbar_prediction.png
- Gold program: nvc_stackbar_prediction.py
- Evaluator: eval_syllogistic_nvc_stackbar_prediction.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 63. ScienceAgentBench instance 63: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 62](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=62)
- Required output: pred_results/bio_ecg_plot.png
- Gold program: bio_interval_analyze.py
- Evaluator: eval_bio_interval_analyze.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 64. ScienceAgentBench instance 64: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 63](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=63)
- Required output: pred_results/plotting_flowline_mb_elevation_pred.png
- Gold program: plotting_flowline_mb_elevation.py
- Evaluator: eval_oggm_plotting_flowline_mb_elevation.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 65. ScienceAgentBench instance 65: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 64](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=64)
- Required output: pred_results/plotting_surface_mass_pred.png
- Gold program: plotting_surface_mass.py
- Evaluator: eval_oggm_plotting_surface_mass.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 66. ScienceAgentBench instance 66: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 65](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=65)
- Required output: pred_results/CogSci_pattern_high_sim_plot_pred.png
- Gold program: CogSci_pattern_high_sim_plot.py
- Evaluator: CogSci_pattern_high_sim_plot_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 67. ScienceAgentBench instance 67: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 66](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=66)
- Required output: pred_results/CogSci_pattern_high_sim_data_pred.csv
- Gold program: CogSci_pattern_high_sim.py
- Evaluator: CogSci_pattern_high_sim_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 68. ScienceAgentBench instance 68: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 67](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=67)
- Required output: pred_results/CogSci_pattern_high_com_low_plot_data_pred.png
- Gold program: CogSci_pattern_high_com_low_plot.py
- Evaluator: CogSci_pattern_high_com_low_plot_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 69. ScienceAgentBench instance 69: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 68](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=68)
- Required output: pred_results/hca_cell_type_pca.png
- Gold program: single_cell_analysis_pca.py
- Evaluator: eval_single_cell_analysis_pca.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 70. ScienceAgentBench instance 70: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 69](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=69)
- Required output: pred_results/hca_cell_type_de.png
- Gold program: single_cell_analysis_de.py
- Evaluator: eval_single_cell_analysis_de.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 71. ScienceAgentBench instance 71: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 70](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=70)
- Required output: pred_results/linear_sub01tosub03_pred.npy
- Gold program: train_thingseeg2_linear.py
- Evaluator: eval_eeg2eeg_linear.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 72. ScienceAgentBench instance 72: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 71](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=71)
- Required output: pred_results/eeg2eeg_sub01tosub03_pred.npy
- Gold program: train_thingseeg2.py
- Evaluator: eval_eeg2eeg.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 73. ScienceAgentBench instance 73: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 72](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=72)
- Required output: pred_results/eeg2eeg_vis_pred.png
- Gold program: eeg2eeg_vis.py
- Evaluator: eval_eeg2eeg_vis.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 74. ScienceAgentBench instance 74: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 73](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=73)
- Required output: pred_results/oggm_plotting_glacier_area_and_thickness_change_pred.png
- Gold program: plotting_glacier_area_and_thickness_change.py
- Evaluator: eval_oggm_plotting_glacier_area_and_thickness_change.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 75. ScienceAgentBench instance 75: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 74](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=74)
- Required output: pred_results/topic_modeling_pred.png
- Gold program: topic_modeling_LDA.py
- Evaluator: eval_topic_modeling_LDA.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 76. ScienceAgentBench instance 76: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 75](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=75)
- Required output: pred_results/mineral_prospectivity.png
- Gold program: mineral_prospectivity_pred.py
- Evaluator: mineralProspectivityEval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 77. ScienceAgentBench instance 77: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 76](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=76)
- Required output: pred_results/interpolated_water_quality.png
- Gold program: WaterQuality.py
- Evaluator: WaterQuality_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 78. ScienceAgentBench instance 78: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 77](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=77)
- Required output: pred_results/pucci-proteins_test_pred.csv
- Gold program: protein_stability.py
- Evaluator: eval_protein_stability.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 79. ScienceAgentBench instance 79: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 78](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=78)
- Required output: pred_results/violin.png
- Gold program: violin.py
- Evaluator: eval_violin.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 80. ScienceAgentBench instance 80: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 79](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=79)
- Required output: pred_results/genes_scatter.png
- Gold program: genes_scatter.py
- Evaluator: eval_gene_scatter.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 81. ScienceAgentBench instance 81: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 80](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=80)
- Required output: pred_results/umap.png
- Gold program: umap.py
- Evaluator: eval_umap.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 82. ScienceAgentBench instance 82: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 81](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=81)
- Required output: pred_results/dendrogram.png
- Gold program: dendrogram.py
- Evaluator: eval_dendrogram.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 83. ScienceAgentBench instance 83: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 82](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=82)
- Required output: pred_results/interpolated_urban_heat.png
- Gold program: UrbanHeat.py
- Evaluator: UrbanHeat_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 84. ScienceAgentBench instance 84: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 83](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=83)
- Required output: pred_results/burn_scar_analysis.png
- Gold program: BurnScar.py
- Evaluator: BurnScar_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 85. ScienceAgentBench instance 85: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 84](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=84)
- Required output: pred_results/saliva_pred.json
- Gold program: saliva.py
- Evaluator: biopsykit_saliva_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 86. ScienceAgentBench instance 86: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 85](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=85)
- Required output: pred_results/TEC_vis.png
- Gold program: plot_TEC.py
- Evaluator: eval_plot_TEC.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 87. ScienceAgentBench instance 87: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 86](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=86)
- Required output: pred_results/polynomial_fit_pred.csv
- Gold program: polynomial_fit.py
- Evaluator: eval_polynomial_fit.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 88. ScienceAgentBench instance 88: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 87](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=87)
- Required output: pred_results/collisions_map_vis.png
- Gold program: plot_collisions_map.py
- Evaluator: eval_plot_collisions_map.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 89. ScienceAgentBench instance 89: Geographical Information Science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 88](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=88)
- Required output: pred_results/trees_count_vis.png
- Gold program: plot_trees_count.py
- Evaluator: eval_plot_trees_count.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 90. ScienceAgentBench instance 90: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 89](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=89)
- Required output: pred_results/fit_result_conscientiousness_H_high.npy
- Gold program: run_jnmf.py
- Evaluator: eval_jnmf.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 91. ScienceAgentBench instance 91: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 90](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=90)
- Required output: pred_results/patterns_conscientiousness.png
- Gold program: jnmf_plot_patterns.py
- Evaluator: eval_jnmf_plot_patterns.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 92. ScienceAgentBench instance 92: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 91](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=91)
- Required output: pred_results/jnmf_h_importances.json
- Gold program: h_importances.py
- Evaluator: eval_h_importances.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 93. ScienceAgentBench instance 93: Psychology and Cognitive science

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 92](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=92)
- Required output: pred_results/H_distribution_conscientiousness.png
- Gold program: plot_h_distribution.py
- Evaluator: eval_h_distribution.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 94. ScienceAgentBench instance 94: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 93](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=93)
- Required output: pred_results/polyverse_visualize_molecules_pred.png
- Gold program: polyverse_visualize_molecules.py
- Evaluator: eval_polyverse_visualize_molecules.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 95. ScienceAgentBench instance 95: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 94](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=94)
- Required output: pred_results/tox21_mol_scscores_pred.npy
- Gold program: synthetic_feasibility_modeling.py
- Evaluator: eval_synthetic_feasibility_modeling.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 96. ScienceAgentBench instance 96: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 95](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=95)
- Required output: pred_results/scatter_pred.png
- Gold program: scatter.py
- Evaluator: scanpy_scatter_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 97. ScienceAgentBench instance 97: Computational Chemistry

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 96](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=96)
- Required output: pred_results/formation_energy_prediction_pred.txt
- Gold program: formation_energy_prediction.py
- Evaluator: eval_formation_energy_prediction.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 98. ScienceAgentBench instance 98: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 97](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=97)
- Required output: pred_results/3k_pred.png
- Gold program: 3k.py
- Evaluator: scirpy_3k_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 99. ScienceAgentBench instance 99: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 98](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=98)
- Required output: pred_results/spatial_pred.png
- Gold program: spatial.py
- Evaluator: scanpy_spatial_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.

## 100. ScienceAgentBench instance 100: Bioinformatics

Expected behavior:

- Execute the verbatim task using the official dataset and create the source-defined output artifact.

Original evaluation assets:

- Source record: [verified row 99](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=99)
- Required output: pred_results/spatial_2_pred.png
- Gold program: spatial_2.py
- Evaluator: scanpy_spatial_2_eval.py

Common failures:

- Using a substitute dataset, changing the task, omitting the required output, inventing evaluation criteria, or reading this answer key during execution.
