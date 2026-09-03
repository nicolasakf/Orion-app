# Human-authored real-data analysis test prompts

These are existing task instructions from the verified split of ScienceAgentBench, not problems written or rewritten for Orion. The benchmark paper says a group of nine graduate-student annotators created the task annotations, including writing each instruction, from code and data released with peer-reviewed publications. Nine subject-matter experts then reviewed the tasks.

## Provenance and use

- Source: [ScienceAgentBench on GitHub](https://github.com/OSU-NLP-Group/ScienceAgentBench) and the [verified dataset on Hugging Face](https://huggingface.co/datasets/osunlp/ScienceAgentBench). Rows 0–99 were retrieved on August 24, 2026.
- Authorship evidence: the paper's [Data Collection section](https://arxiv.org/html/2410.05080#S2.SS2) documents the human annotation workflow, names writing the instruction as an annotation step, and describes independent annotator verification plus expert review. This is strong evidence of human authorship, although the public record cannot prove that no automated writing tool touched any sentence.
- Exactness: every blockquote below is copied from the source task_inst field. No Orion-specific instructions were inserted into the task text.
- Real data: each source record pairs the task with research or upstream project data and includes a dataset preview.
- Dataset access: obtain the official benchmark artifacts through the access instructions in the repository. Do not commit or redistribute the unzipped data files; the benchmark explicitly asks users not to publish them online.
- Licensing: the repository describes most task annotations as CC BY 4.0 and identifies instances whose upstream licenses take precedence.
- Evaluation metadata and answer-key separation are in answers.md.

## 1. ScienceAgentBench instance 1: Computational Chemistry

> Train a multitask model on the Clintox dataset to predict a drug's toxicity and FDA approval status. Save the test set predictions, including the SMILES representation of drugs and the probability of positive labels, to "pred_results/clintox_test_pred.csv".

Source metadata (not part of the task):

- Source record: [verified row 0](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=0)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): clintox
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/clintox

## 2. ScienceAgentBench instance 2: Computational Chemistry

> Generate features for the given diffusion data based on material composition and use the SHAP feature selection approach to select 20 features. Save the selected features as a CSV file "mat_diffusion_features.csv" to the folder "pred_results/".

Source metadata (not part of the task):

- Source record: [verified row 1](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=1)
- Domain: Computational Chemistry
- Task categories: Feature Selection, Machine Learning
- Dataset root(s): mat_diffusion
- Upstream repository: [uw-cmg/MAST-ML](https://github.com/uw-cmg/MAST-ML)
- Upstream source path: examples/MASTML_Tutorial_3_FeatureEngineering.ipynb

## 3. ScienceAgentBench instance 3: Computational Chemistry

> Train a random forest model with the given dataset of inorganic crystalline compounds to predict their bulk modulus (K_VRH). Format the test set predictions as a two column dataframe, material_id and K_VRH, and save it to "pred_results/compound_bulk_modulus.csv".

Source metadata (not part of the task):

- Source record: [verified row 2](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=2)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): crystalline_compound
- Upstream repository: [hackingmaterials/matminer_examples](https://github.com/hackingmaterials/matminer_examples)
- Upstream source path: matminer_examples/machine_learning-nb/bulk_modulus.ipynb

## 4. ScienceAgentBench instance 4: Geographical Information Science

> Analyze and visualize Elk movements in the given dataset. Estimate home ranges and assess habitat preferences using spatial analysis techniques. Identify the spatial clusters of Elk movements. Document the findings with maps and visualizations. Save the figure as "pred_results/Elk_Analysis.png".

Source metadata (not part of the task):

- Source record: [verified row 3](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=3)
- Domain: Geographical Information Science
- Task categories: Statistical Analysis, Data Visualization
- Dataset root(s): ElkMovement
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 5. ScienceAgentBench instance 5: Bioinformatics

> Use the DKPES dataset to develop a Random Forest classifier predicting signal inhibition of chemicals while choosing appropriate threshold to assign binary labels based on signal inhibition values. Save the test set predictions, including the index and predicted signal inhibition, in "pred_results/dkpes_test_pred.csv".

Source metadata (not part of the task):

- Source record: [verified row 4](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=4)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): dkpes
- Upstream repository: [psa-lab/predicting-activity-by-machine-learning](https://github.com/psa-lab/predicting-activity-by-machine-learning)
- Upstream source path: code/dkpes_fgroup_analysis.ipynb

## 6. ScienceAgentBench instance 6: Bioinformatics

> Given the DKPES dataset, visualize the distribution of signal inhibition values and also visualize their relationship with the tanimoto similarity score. Save the figure as "pred_results/dkpes_molecular_analysis_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 5](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=5)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): dkpes
- Upstream repository: [psa-lab/predicting-activity-by-machine-learning](https://github.com/psa-lab/predicting-activity-by-machine-learning)
- Upstream source path: code/dkpes_fgroup_analysis.ipynb

## 7. ScienceAgentBench instance 7: Bioinformatics

> Visualize the distribution of functional groups for the 10 most and 10 least active molecules in the DKPES dataset. Save the figure as "pred_results/dkpes_molecular_activity_analysis_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 6](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=6)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): dkpes
- Upstream repository: [psa-lab/predicting-activity-by-machine-learning](https://github.com/psa-lab/predicting-activity-by-machine-learning)
- Upstream source path: code/dkpes_fgroup_analysis.ipynb

## 8. ScienceAgentBench instance 8: Bioinformatics

> Perform backward feature selection using logistic regression to identify the most relevant chemical features for predicting signal inhibition from the DKPES dataset. Binarize the signal inhibition values using appropriate threshold. Visualize the accuracy as a function of the number of selected features. Save the plot as "pred_results/dkpes_feature_selection_analysis_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 7](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=7)
- Domain: Bioinformatics
- Task categories: Feature Selection, Data Visualization
- Dataset root(s): dkpes
- Upstream repository: [psa-lab/predicting-activity-by-machine-learning](https://github.com/psa-lab/predicting-activity-by-machine-learning)
- Upstream source path: code/dkpes_fgroup_analysis.ipynb

## 9. ScienceAgentBench instance 9: Computational Chemistry

> Compute the correlations of FACTORS tasks and save the results. Load the FACTORS dataset, compute the Pearson correlation coefficient between each task and every other task. Save the computed results as a histogram to "./pred_results/Factors_correlations.png".

Source metadata (not part of the task):

- Source record: [verified row 8](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=8)
- Domain: Computational Chemistry
- Task categories: Statistical Analysis, Data Visualization
- Dataset root(s): FACTORS
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/factors/FACTORS_correlations.py

## 10. ScienceAgentBench instance 10: Geographical Information Science

> Analyze Toronto fire stations and their service coverage. Visualize the results to identify coverage gaps. Save the figure as "pred_results/Fire_Service_Analysis.png".

Source metadata (not part of the task):

- Source record: [verified row 9](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=9)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): Toronto_fire
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 11. ScienceAgentBench instance 11: Bioinformatics

> Train a cell counting model on the BBBC002 datasets containing Drosophila KC167 cells. Save the test set predictions as a single column "count" to "pred_results/cell-count_pred.csv".

Source metadata (not part of the task):

- Source record: [verified row 10](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=10)
- Domain: Bioinformatics
- Task categories: Deep Learning
- Dataset root(s): BBBC002
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Cell_Counting_Tutorial.ipynb

## 12. ScienceAgentBench instance 12: Bioinformatics

> Train a drug-target interaction model using the DAVIS dataset to determine the binding affinity between several drugs and targets. Then use the trained model to predict the binding affinities between antiviral drugs and COVID-19 target. Rank the antiviral drugs based on their predicted affinities and save the ordered list of drugs to "pred_results/davis_dti_repurposing.txt", with one drug name per line.

Source metadata (not part of the task):

- Source record: [verified row 11](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=11)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): dti
- Upstream repository: [kexinhuang12345/DeepPurpose](https://github.com/kexinhuang12345/DeepPurpose)
- Upstream source path: Tutorial_1_DTI_Prediction.ipynb

## 13. ScienceAgentBench instance 13: Bioinformatics

> Train a property prediction model using the HIV dataset to predict the activity of drugs against HIV. Save the SMILES strings and their corresponding predictions to "pred_results/hiv_test_pred.csv," using the same column names as in the given dataset.

Source metadata (not part of the task):

- Source record: [verified row 12](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=12)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): hiv
- Upstream repository: [kexinhuang12345/DeepPurpose](https://github.com/kexinhuang12345/DeepPurpose)
- Upstream source path: Tutorial_2_Drug_Property_Pred_Assay_Data.ipynb

## 14. ScienceAgentBench instance 14: Geographical Information Science

> Analyze the impact of land subsidence on flooding based on future elevation data of the study area. Identify flood-prone areas and estimate potential building damage to support urban planning and mitigation strategies. Save the results to "pred_results/flooding_analysis.png".

Source metadata (not part of the task):

- Source record: [verified row 13](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=13)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): Flooding
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 15. ScienceAgentBench instance 15: Bioinformatics

> Train a model on the ames dataset to predict a drug's toxicity. Save the test set predictions, including the SMILES representaion of drugs and the probability of being positive, to "pred_results/aai_preds.csv".

Source metadata (not part of the task):

- Source record: [verified row 14](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=14)
- Domain: Bioinformatics
- Task categories: Deep Learning
- Dataset root(s): ames
- Upstream repository: [swansonk14/admet_ai](https://github.com/swansonk14/admet_ai)
- Upstream source path: scripts/train_tdc_admet_group.py

## 16. ScienceAgentBench instance 16: Computational Chemistry

> Filter the compounds in "hits.csv" and save the SMILES representations of the left ones. Compounds to be kept should have no PAINS or Brenk filter substructures and have a maximum tanimoto similarity of less than 0.5 to any of the active compounds in "train.csv". Save the SMILES of left compounds to "pred_results/compound_filter_results.txt", with each one in a line.

Source metadata (not part of the task):

- Source record: [verified row 15](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=15)
- Domain: Computational Chemistry
- Task categories: Computational Analysis
- Dataset root(s): compound_filter
- Upstream repository: [felixjwong/antibioticsai](https://github.com/felixjwong/antibioticsai)
- Upstream source path: notebooks/Filtering hits and computing rationale scaffolds.ipynb

## 17. ScienceAgentBench instance 17: Computational Chemistry

> Given an input file containing the list of compounds with their SMILES and activity values against the A2A receptor, visualize the chemical space covered by such compounds. Use a 2D projection method to represent the chemical space and color the data points based on their activity. Save the resulting visualization as a PNG file titled "pred_results/drugex_vis_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 16](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=16)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Statistical Analysis, Data Visualization
- Dataset root(s): papyrus_vis
- Upstream repository: [martin-sicho/papyrus-scaffold-visualizer](https://github.com/martin-sicho/papyrus-scaffold-visualizer)
- Upstream source path: examples/example_coloring.py

## 18. ScienceAgentBench instance 18: Bioinformatics

> Train a Random Forest classifier to predict whether a given chemical structure (in SMILES format) poses a Drug-Induced Liver Injury (DILI) concern. The dataset's vDILIConcern column classifies 'vMost-DILI-Concern' and 'vLess-DILI-Concern' as positive, and 'vNo-DILI-Concern' and 'sider_inactive' as negative. The training dataset is split into different sets: MC (1–173), LC (174–433), NC (434–660), and sider (661–923). Use these splits to create three task configurations: MCNC (classifying MC vs NC drugs), MCLCNC (classifying MC/LC vs NC drugs), and all (classifying MC/LC vs NC/sider-inactive drugs). For each task configuration, use the training examples to perform 5-fold cross-validation and hyperparameter search. Use the model trained on the best hyperparameter and save the prediction results to "pred_results/{data_conf}_RF.csv" where data_conf is the name of different data configurations (i.e., MCNC, MCLCNC, and all). Put the chemical smiles name and predicted label (’DILI’ or ’NoDILI’)  in the ’standardised_smiles’ and ’label’ column respectively.

Source metadata (not part of the task):

- Source record: [verified row 17](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=17)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): dili
- Upstream repository: [anikaliu/CAMDA-DILI](https://github.com/anikaliu/CAMDA-DILI)
- Upstream source path: Machine_Learning/code/models_ECFP.py

## 19. ScienceAgentBench instance 19: Bioinformatics

> Train a support vector machine (SVM) classifier to predict whether a given chemical structure (in SMILES format) poses a Drug-Induced Liver Injury (DILI) concern. The dataset's vDILIConcern column classifies 'vMost-DILI-Concern' and 'vLess-DILI-Concern' as positive, and 'vNo-DILI-Concern' and 'sider_inactive' as negative. The training dataset is split into different sets: MC (1–173), LC (174–433), NC (434–660), and sider (661–923). Use these splits to create three task configurations: MCNC (classifying MC vs NC drugs), MCLCNC (classifying MC/LC vs NC drugs), and all (classifying MC/LC vs NC/sider-inactive drugs). For each task configuration, use the training examples to perform cross-validation and hyperparameter search. Use the model trained on the best hyperparameter and save the prediction results to "pred_results/{data_conf}_SVM.csv", where data_conf is the name of different data configurations (i.e., MCNC, MCLCNC, and all). Put the chemical smiles name and predicted label (’DILI’ or ’NoDILI’)  in the ’standardised_smiles’ and ’label’ column respectively.

Source metadata (not part of the task):

- Source record: [verified row 18](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=18)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): dili
- Upstream repository: [anikaliu/CAMDA-DILI](https://github.com/anikaliu/CAMDA-DILI)
- Upstream source path: Machine_Learning/code/models_ECFP.py

## 20. ScienceAgentBench instance 20: Bioinformatics

> Visualize the R² results comparing single-task and multi-task performance for different datasets in TDC ADMET. Save the visualization as 'pred_results/tdc_results_visualization.png.'

Source metadata (not part of the task):

- Source record: [verified row 19](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=19)
- Domain: Bioinformatics
- Task categories: Statistical Analysis, Data Visualization
- Dataset root(s): TDC_ADMET
- Upstream repository: [swansonk14/admet_ai](https://github.com/swansonk14/admet_ai)
- Upstream source path: scripts/plot_tdc_results.py

## 21. ScienceAgentBench instance 21: Geographical Information Science

> Calculate the deforestation area percentage in the Brazilian state of Rondônia within the buffer zone of 5.5km around road layers. Save the percentage result in a CSV file named "pred_results/deforestation_rate.csv" with a column title percentage_deforestation.

Source metadata (not part of the task):

- Source record: [verified row 20](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=20)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis
- Dataset root(s): deforestation
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 22. ScienceAgentBench instance 22: Computational Chemistry

> Filter the papyrus dataset in 'papyrus_unfiltered.pkl' according to the follwing standards: 1. only keep the data with quality 'medium' or above. 2. Filter out any protein not belong to two classes: 'Ligand-gated ion channels' and 'SLC superfamily of solute carriers'. 3. Only keep data with activity types of Ki or KD. 4. Only keep human and rat data. Protein information in 'papyrus_protein_set.pkl' may be required. Save the filtered dataset with the same column names to 'pred_results/papyrus_filtered.pkl'.

Source metadata (not part of the task):

- Source record: [verified row 21](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=21)
- Domain: Computational Chemistry
- Task categories: Data Selection
- Dataset root(s): papyrus
- Upstream repository: [OlivierBeq/Papyrus-scripts](https://github.com/OlivierBeq/Papyrus-scripts)
- Upstream source path: notebook_examples/simple_examples.ipynb

## 23. ScienceAgentBench instance 23: Geographical Information Science

> Predict the effect of future proposed roads on the deforestation of in the Brazilian state of Rondônia. A planned road network will be added to Rondônia, create a buffer zone of 5.5km around the new roads. Visualize the change created by the roads with the planned roads, existing roads, deforested area, and protected forest along with the boundary of Rondônia. Save the output as "pred_results/predictedRiskyArea.png".

Source metadata (not part of the task):

- Source record: [verified row 22](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=22)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): PredictDeforestation
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 24. ScienceAgentBench instance 24: Psychology and Cognitive science

> Process and visualize the given ECG data by perform R peak detection and outlier correction. Plot an overview of the data and save the final figure as "pred_results/ecg_processing_vis1_pred_result.png".

Source metadata (not part of the task):

- Source record: [verified row 23](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=23)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): ecg_processing_data
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/ECG_Processing_Example.ipynb

## 25. ScienceAgentBench instance 25: Psychology and Cognitive science

> Process the given ECG data and show heart rate variability (HRV) plot. After loading the ECG data, perform R peak detection and outlier correction. Then, you need to divide the data into two phases: the first phase is from 12:32 to 12:35, the second phase is from 12:35 to 12:38. Create a HRV plot for the second phase and save the final figure as "pred_results/ecg_processing_vis2_pred_result.png".

Source metadata (not part of the task):

- Source record: [verified row 24](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=24)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): ecg_processing_data
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/ECG_Processing_Example.ipynb

## 26. ScienceAgentBench instance 26: Computational Chemistry

> Generate the interaction fingerprints between a selected ligand and protein for the first 10 trajectory frames. Combine the ligand, protein, type of interactions, and frame index into names in the output CSV file pred_results/ligand_fingerprint_pred.csv. Additionally, save the status of the fingerprint under the column Y.

Source metadata (not part of the task):

- Source record: [verified row 25](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=25)
- Domain: Computational Chemistry
- Task categories: Computational Analysis
- Dataset root(s): ligand_protein
- Upstream repository: [chemosim-lab/ProLIF](https://github.com/chemosim-lab/ProLIF)
- Upstream source path: docs/notebooks/md-ligand-protein.ipynb

## 27. ScienceAgentBench instance 27: Bioinformatics

> Use the given compound pairwise similarities in dili_visualization/tanimoto_similarities.txt and also the test split indices in dili_visualization/mcnc_ttsplits_te.pkl to plot the distribution of similarities of the test and train examples. For each test example, the similarity should be computed by the average of the similarities of the 5-nearest-neighbors within the corresponding training examples. Save the results to "pred_results/similarity_plot.png".

Source metadata (not part of the task):

- Source record: [verified row 26](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=26)
- Domain: Bioinformatics
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): dili_visualization
- Upstream repository: [anikaliu/CAMDA-DILI](https://github.com/anikaliu/CAMDA-DILI)
- Upstream source path: Machine_Learning/code/similarity_plots.py

## 28. ScienceAgentBench instance 28: Computational Chemistry

> Calculate the charge density difference between two constituent systems (A and B) and their combined system (AB). Generate a charge density difference file and plot the planar averaged charge density along the z-axis. Save the plot as pred_results/charge_density_difference.png.

Source metadata (not part of the task):

- Source record: [verified row 27](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=27)
- Domain: Computational Chemistry
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): materials_genomics
- Upstream repository: [materialsproject/pymatgen](https://github.com/materialsproject/pymatgen)
- Upstream source path: notebooks/2024-06-28-Charge_Density_Difference.ipynb

## 29. ScienceAgentBench instance 29: Psychology and Cognitive science

> Localize the events from the biosignals of one participant in "bio_eventrelated_100hz.csv". Analyze the event-related features (e.g., ECG Rate, SCR Peak, Respiratory Volume per Time). Save the results to "pred_results/bio_eventrelated_100hz_analysis_pred.csv" with the following four columns: "Condition", "ECG_Rate_Mean", "RSP_Rate_Mean", and "EDA_Peak_Amplitude".

Source metadata (not part of the task):

- Source record: [verified row 28](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=28)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/bio_eventrelated/bio_eventrelated.ipynb

## 30. ScienceAgentBench instance 30: Computational Chemistry

> Calculate and plot the phonon band structure using the output from VASP DFPT calculations saved in "vasprun.dfpt.phonon.xml.gz". Save the plot as pred_results/phonon_bandstructure.png.

Source metadata (not part of the task):

- Source record: [verified row 29](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=29)
- Domain: Computational Chemistry
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): materials_genomics
- Upstream repository: [materialsproject/pymatgen](https://github.com/materialsproject/pymatgen)
- Upstream source path: notebooks/2016-09-25-Plotting phonon bandstructure and dos.ipynb

## 31. ScienceAgentBench instance 31: Computational Chemistry

> Using the DFPT results in "vasprun.dfpt.phonon.xml.gz", define the Si primitive cell and compute the phonon density of states (DOS) with Phonopy and generate a DOS plot. Save the figure to pred_results/phonon_dos.png.

Source metadata (not part of the task):

- Source record: [verified row 30](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=30)
- Domain: Computational Chemistry
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): materials_genomics
- Upstream repository: [materialsproject/pymatgen](https://github.com/materialsproject/pymatgen)
- Upstream source path: notebooks/2016-09-25-Plotting phonon bandstructure and dos.ipynb

## 32. ScienceAgentBench instance 32: Geographical Information Science

> Perform raster analysis on the elevation and environmental factors influencing coral and sponge distribution at Catalina Island. Update the database with the slope and aspect analysis results. Use the updated database to visualize the mean slope and aspect distribution of each Coral and Sponge vernacular names in Catalina Island as "pred_results/CoralandSponge.png".

Source metadata (not part of the task):

- Source record: [verified row 31](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=31)
- Domain: Geographical Information Science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): CoralSponge
- Upstream repository: [rasterio/rasterio](https://github.com/rasterio/rasterio)

## 33. ScienceAgentBench instance 33: Geographical Information Science

> Perform analysis on public transit access in Hamilton County Tennessee. Map existing bus stops‘s service area with enriched map layers for different census blocks, including poverty, population density, and accessibility to a vehicle. Overlay and visualize the resulting data as "pred_results/transit_access.png".

Source metadata (not part of the task):

- Source record: [verified row 32](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=32)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): TransitAccessDemographic
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 34. ScienceAgentBench instance 34: Psychology and Cognitive science

> Use the data in "bio_resting_5min_100hz.csv" to compute heart rate variability (HRV) indices in the time-, frequency-, and non-linear domain. Find the peaks of ECG signal and extract features from three domains (i.e., time-domain, frequency-domain and non-linear domain). Save the extracted features from these three domains to 'pred_results/hrv_analysis_pred.csv'.

Source metadata (not part of the task):

- Source record: [verified row 33](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=33)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/ecg_hrv/ecg_hrv.ipynb

## 35. ScienceAgentBench instance 35: Psychology and Cognitive science

> Perform RRV analysis on the given data in "bio_eventrelated_100hz.csv". Clean the RSP signal and extract the inhalation peaks of the signal and the respiratory rate signal. Then use these features to analyze RRV, getting a variety of RRV indices including time domain, frequency domain, and nonlinear features. Save the results to 'pred_results/rrv_analysis_pred.csv'.

Source metadata (not part of the task):

- Source record: [verified row 34](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=34)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/rsp_rrv/rsp_rrv.ipynb

## 36. ScienceAgentBench instance 36: Psychology and Cognitive science

> Process the EEG data and plot the 20-point moving average of its EEG frequency band power. The output figure should be a line chart of the four functionally distinct frequency bands with respect to the timestamp. Save the figure as "pred_results/eeg_processing_vis1_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 35](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=35)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): eeg_processing
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/EEG_Processing_Example.ipynb

## 37. ScienceAgentBench instance 37: Psychology and Cognitive science

> Load the heart rate data in the sheet "MIST3" and calculate several CFT parameters. The required parameters include baseline heart rate, onset heart rate, and onset heart rate percentage. Save the parameters in a JSON file "pred_results/cft_pred_results.json", where the keys for the three parameters should be "baseline_hr", "onset_hr", and "onset_hr_percent", respectively.

Source metadata (not part of the task):

- Source record: [verified row 36](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=36)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): mist_hr
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/CFT_Example.ipynb

## 38. ScienceAgentBench instance 38: Computational Chemistry

> Plot the Tanimoto similarities of the fingerprint between the frames. Specifically, the interaction fingerprints between a selected ligand and protein for the first 10 trajectory frames. Save the png file into the pred_results/ligand_similarity_pred.png

Source metadata (not part of the task):

- Source record: [verified row 37](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=37)
- Domain: Computational Chemistry
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): ligand_protein
- Upstream repository: [chemosim-lab/ProLIF](https://github.com/chemosim-lab/ProLIF)
- Upstream source path: docs/notebooks/md-ligand-protein.ipynb

## 39. ScienceAgentBench instance 39: Computational Chemistry

> Plot the Tanimoto similarities of the fingerprint between the frames. Specifically, the interaction fingerprints between a selected small protein and large protein for the first 10 trajectory frames. Save the png file into the pred_results/protein_protein_similarity_pred.png

Source metadata (not part of the task):

- Source record: [verified row 38](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=38)
- Domain: Computational Chemistry
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): protein_protein
- Upstream repository: [chemosim-lab/ProLIF](https://github.com/chemosim-lab/ProLIF)
- Upstream source path: docs/notebooks/md-protein-protein.ipynb

## 40. ScienceAgentBench instance 40: Bioinformatics

> Train a random forest model to predict whether a given chemical structure has Drug-Induced Liver Injury (DILI) concerns, based on the given features. Use the training examples to perform hyperparameter search and model training, and save the prediction results to "pred_results/MD_{data_split}_RF.csv" where data_split is the name of different training splits ('MCNC', 'MCLCNC', and 'all'). Add a ’label’ column and put the predicted labels (’DILI’ or ’NoDILI’) in the column.

Source metadata (not part of the task):

- Source record: [verified row 39](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=39)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): dili_MD
- Upstream repository: [anikaliu/CAMDA-DILI](https://github.com/anikaliu/CAMDA-DILI)
- Upstream source path: Machine_Learning/code/models_MD.py

## 41. ScienceAgentBench instance 41: Bioinformatics

> Train a K-nearest neighbor model to predict whether a given chemical structure has Drug-Induced Liver Injury (DILI) concerns, based on the given features. Use the training examples to perform hyperparameter search and model training, and save the prediction results to "pred_results/MD_{data_split}_KNN.csv" where data_split is the name of different training splits ('MCNC', 'MCLCNC', and 'all'). Add a ’label’ column and put the predicted labels (’DILI’ or ’NoDILI’) in the column.

Source metadata (not part of the task):

- Source record: [verified row 40](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=40)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): dili_MD
- Upstream repository: [anikaliu/CAMDA-DILI](https://github.com/anikaliu/CAMDA-DILI)
- Upstream source path: Machine_Learning/code/models_MD.py

## 42. ScienceAgentBench instance 42: Psychology and Cognitive science

> Extract ECG-derived respiration (EDR) from ECG signals and visuaize them. Extract the R peaks of the signal and compute the heart period. Compute EDR with 4 different methods and plot them in one figure to compare. Save the figure to 'pred_results/EDR_analyze_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 41](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=41)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/ecg_edr/ecg_edr.ipynb

## 43. ScienceAgentBench instance 43: Psychology and Cognitive science

> Analyze Electrooculography (EOG). Filter the EOG signal to remove some noise and trends. Run a peak detection algorithm to detect peaks location of eye blinks. Save the visualization of eye blinks to 'pred_results/EOG_analyze_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 42](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=42)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/eog_analyze/eog_analyze.ipynb

## 44. ScienceAgentBench instance 44: Psychology and Cognitive science

> Analyze the inertial measurement unit (IMU) data collected during sleep and compute sleep endpoints. Load the given data and compute the following sleep endpoints: time of falling asleep, time of awakening, and total duration spent sleeping. The three values should be saved in a JSON file "pred_results/imu_pred.json", and the keys for them are "sleep_onset", "wake_onset", and "total_sleep_duration", respectively.

Source metadata (not part of the task):

- Source record: [verified row 43](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=43)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): sleep_imu_data
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/Sleep_IMU_Example.ipynb

## 45. ScienceAgentBench instance 45: Psychology and Cognitive science

> Given the questionnaire data, compute perceived stress scale (PSS) score. The results should be stored as a csv file "pred_results/questionnaire_pred.csv", where the columns are subject of the data item, perceived helplessness, perceived self-efficacy, and the total PSS score, respectively, but do not save the header.

Source metadata (not part of the task):

- Source record: [verified row 44](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=44)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): biopsykit_questionnaire_data
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/Questionnaire_Example.ipynb

## 46. ScienceAgentBench instance 46: Geographical Information Science

> To evaluate mountain lion habitat suitability, calculate terrain ruggedness using elevation data. Visualize and save the outputs as "pred_results/ruggedness.png".

Source metadata (not part of the task):

- Source record: [verified row 45](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=45)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): MountainLionNew
- Upstream repository: [rasterio/rasterio](https://github.com/rasterio/rasterio)

## 47. ScienceAgentBench instance 47: Geographical Information Science

> To evaluate mountain lion habitat suitability, calculate the distance from roads to habitats using vector road data. Then, compute the Euclidean distance from the nearest road to each cell. Visualize and save the output as "pred_results/distance_to_habitat.png".

Source metadata (not part of the task):

- Source record: [verified row 46](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=46)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): MountainLionNew
- Upstream repository: [geopandas/geopandas](https://github.com/geopandas/geopandas)

## 48. ScienceAgentBench instance 48: Geographical Information Science

> Compute and plot the leading Empirical Orthogonal Function (EOF) of sea surface temperature in the central and northern Pacific during winter time. Save the figure as 'pred_results/sst_visualization_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 47](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=47)
- Domain: Geographical Information Science
- Task categories: Computational Analysis, Map Visualization
- Dataset root(s): sea_surface_temperature
- Upstream repository: [ajdawson/eofs/](https://github.com/ajdawson/eofs)
- Upstream source path: examples/standard/sst_example.py

## 49. ScienceAgentBench instance 49: Geographical Information Science

> Compute and plot the leading EOF of geopotential height on the 500 hPa pressure surface over the European/Atlantic sector during winter time. Save the figure as 'pred_results/EOF_standard.png'.

Source metadata (not part of the task):

- Source record: [verified row 48](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=48)
- Domain: Geographical Information Science
- Task categories: Computational Analysis, Map Visualization
- Dataset root(s): EOF_standard
- Upstream repository: [ajdawson/eofs/](https://github.com/ajdawson/eofs)
- Upstream source path: examples/standard/hgt_example.py

## 50. ScienceAgentBench instance 50: Geographical Information Science

> Compute and plot the leading Empirical Orthogonal Function (EOF) of sea surface temperature in the central and northern Pacific during winter time. The associated time series shows large peaks and troughs for well-known El Nino and La Nina events. Save the figure as 'pred_results/EOF_xarray_sst.png'.

Source metadata (not part of the task):

- Source record: [verified row 49](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=49)
- Domain: Geographical Information Science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): EOF_xarray_sst
- Upstream repository: [ajdawson/eofs/](https://github.com/ajdawson/eofs)
- Upstream source path: examples/xarray/sst_example.py

## 51. ScienceAgentBench instance 51: Computational Chemistry

> Train a graph convolutional network on the given dataset to predict the blood-brain barrier permeability of compounds. Evaluate the model on the test set and save the predictions under the column "label" to "pred_results/brain_blood_qsar.csv".

Source metadata (not part of the task):

- Source record: [verified row 50](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=50)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): brain-blood
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Atomic_Contributions_for_Molecules.ipynb

## 52. ScienceAgentBench instance 52: Computational Chemistry

> Train a graph convolutional network on the given dataset to predict the aquatic toxicity of compounds. Use the resulting model to compute and visualize the atomic contributions to molecular activity of the given test example compound. Save the figure as "pred_results/aquatic_toxicity_qsar_vis.png".

Source metadata (not part of the task):

- Source record: [verified row 51](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=51)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Deep Learning, Computational Analysis, Molecule Visualization
- Dataset root(s): aquatic_toxicity
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Atomic_Contributions_for_Molecules.ipynb

## 53. ScienceAgentBench instance 53: Geographical Information Science

> Standardize land cover and protected status datasets for consistency in analysis for mountain lion habitat. Reclassify these categorical datasets to a common scale using geospatial tools. Save the reclassified data as pred_results/landCover_reclassified.tif and pred_results/protected_status_reclassified.tif.

Source metadata (not part of the task):

- Source record: [verified row 52](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=52)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis
- Dataset root(s): MountainLionNew
- Upstream repository: [rasterio/rasterio](https://github.com/rasterio/rasterio)

## 54. ScienceAgentBench instance 54: Geographical Information Science

> Integrate ruggedness, road distance, land cover, and protected status into a single cost surface. Assign weights to each criterion to create a comprehensive habitat suitability map. Save the composite cost surface as "pred_results/mountainLionCorridor.png".

Source metadata (not part of the task):

- Source record: [verified row 53](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=53)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): MountainLionNew
- Upstream repository: [rasterio/rasterio](https://github.com/rasterio/rasterio)

## 55. ScienceAgentBench instance 55: Geographical Information Science

> Use sea temperature and salinity data from the South Atlantic Ocean to calculate and plot a vertical temperature-salinity profile within a specified range of latitude, longitude, and depth. Save the figure as 'pred_results/ocean_profiles_vis.png'.

Source metadata (not part of the task):

- Source record: [verified row 54](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=54)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): ocean_profiles
- Upstream repository: [SciTools/iris](https://github.com/SciTools/iris)
- Upstream source path: docs/gallery_code/oceanography/plot_atlantic_profiles.py

## 56. ScienceAgentBench instance 56: Geographical Information Science

> Use 240 years of annual average surface temperature data from North America to calculate and plot the number of occurrences where the temperature exceeds 280K for five consecutive years. Save the figure as 'pred_results/temperature_statistic_vis.png'.

Source metadata (not part of the task):

- Source record: [verified row 55](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=55)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): temperature_statistic
- Upstream repository: [SciTools/iris](https://github.com/SciTools/iris)
- Upstream source path: docs/gallery_code/general/plot_custom_aggregation.py

## 57. ScienceAgentBench instance 57: Psychology and Cognitive science

> Generate a heatmap to visualize the number of persons associated with each model and rule using the data from ind_data_for_plot.csv. Save the resulting plot as indiv_table.png in the pred_results/ directory.

Source metadata (not part of the task):

- Source record: [verified row 56](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=56)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/indiv_table/indiv_table.py

## 58. ScienceAgentBench instance 58: Psychology and Cognitive science

> Generate a CSV file 'individuals.csv' containing the number of persons whose best-fit model-rule combination aligns with the models and rules from a set of given predictions. Each row in the CSV should represent a model-rule combination with the format: "Model; Rule; Num persons". Save this CSV file in the pred_results/ directory.

Source metadata (not part of the task):

- Source record: [verified row 57](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=57)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/indiv_table/individuals.py

## 59. ScienceAgentBench instance 59: Psychology and Cognitive science

> Create a heatmap visualization for the NVC (No Valid Conclusion) predictions from various models and the Most Frequent Answer (MFA) for syllogistic reasoning tasks. Save the resulting plot as 'nvc_heatmap.png' in the 'pred_results/' directory.

Source metadata (not part of the task):

- Source record: [verified row 58](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=58)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/nvc_predictions/nvc_heatmap.py

## 60. ScienceAgentBench instance 60: Psychology and Cognitive science

> Evaluate the predictions made by various syllogistic reasoning models and NVC (No Valid Conclusion) rules against the MFA (most frequent answer) benchmark. The program should output a CSV file named accuracies.csv saved to pred_results/, detailing each model's predictions, the true answers, and the improvements achieved by the NVC rules.

Source metadata (not part of the task):

- Source record: [verified row 59](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=59)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/prediction_errors/accuracies.py

## 61. ScienceAgentBench instance 61: Psychology and Cognitive science

> Create a stacked bar plot visualizing the error metrics (misses, false alarms, total errors) for different models using the plain_prediction data. The dataset is available in the accuracies_data_for_plot.csv file. Save the resulting plot as stackedbar_plain_prediction.png in the pred_results/ directory.

Source metadata (not part of the task):

- Source record: [verified row 60](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=60)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/prediction_errors/stackedbar.py

## 62. ScienceAgentBench instance 62: Psychology and Cognitive science

> Generate a stacked bar plot illustrating the error metrics (misses, false alarms, total errors) for different models using the prediction data. The data is available in the accuracies_data_for_plot.csv file. Save the resulting plot as stackedbar_prediction.png in the pred_results/ directory.

Source metadata (not part of the task):

- Source record: [verified row 61](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=61)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): nvc
- Upstream repository: [nriesterer/syllogistic-nvc](https://github.com/nriesterer/syllogistic-nvc)
- Upstream source path: analysis/prediction_errors/stackedbar.py

## 63. ScienceAgentBench instance 63: Psychology and Cognitive science

> Analyze longer periods of resting state data in 'bio_resting_5min_100hz.csv'. Process ECG and RSP signals and perform analysis. The results will contain mean signal rate, as well as variability metrices pertaining to heart rate variability (HRV) and respiratory rate variability (RRV). Save the visualization of processed signals into 'pred_results/bio_ecg_plot.png' and 'pred_results/bio_rsp_plot.png' with tight bounding boxes.

Source metadata (not part of the task):

- Source record: [verified row 62](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=62)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): biosignals
- Upstream repository: [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit)
- Upstream source path: docs/examples/bio_intervalrelated/bio_intervalrelated.ipynb

## 64. ScienceAgentBench instance 64: Geographical Information Science

> Show a plot comparing the flowline of region 'RGI60-11.00001' in year 2010 and 2005 with OGGM. The plot should show the mass-balance (MB, in mm w.e. per year) against elevation (in m a.s.i). Use the MultipleFlowlineMassBalance model. Save the plot to 'pred_results/plotting_flowline_mb_elevation_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 63](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=63)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Data Visualization
- Dataset root(s): ocean_glacier
- Upstream repository: [OGGM/tutorials](https://github.com/OGGM/tutorials)
- Upstream source path: notebooks/tutorials/plot_mass_balance.ipynb

## 65. ScienceAgentBench instance 65: Geographical Information Science

> Show a time series plot for the mass-balance (MB) computed by OGGM for the region 'RGI60-11.00001' from 1960 to 2020. Use the MultipleFlowlineMassBalance model. Save the plot to 'pred_results/plotting_surface_mass_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 64](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=64)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Data Visualization
- Dataset root(s): ocean_glacier
- Upstream repository: [OGGM/tutorials](https://github.com/OGGM/tutorials)
- Upstream source path: notebooks/tutorials/distribute_flowline.ipynb

## 66. ScienceAgentBench instance 66: Psychology and Cognitive science

> Generate radar plots comparing cognitive models' similarities to consciousness and openness. Create two polar subplots, one for each personality trait, displaying the similarity scores for seven cognitive models. The resulting visualization will be saved into 'pred_results/CogSci_pattern_high_sim_plot_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 65](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=65)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): CogSci_pattern_high_sim_plot_data
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: analysis/cognitive_model_comparison/model_radar.py

## 67. ScienceAgentBench instance 67: Psychology and Cognitive science

> Analyze cognitive theories using pattern similarity. Process CSV files containing model predictions for various syllogistic reasoning tasks. Calculate similarity scores between these models and pre-computed high-conscientiousness and high-openness patterns. The results will contain similarity scores for each cognitive model with respect to the personality trait patterns. Save the similarity scores for every model to 'pred_results/CogSci_pattern_high_sim_data_pred.csv' using the trait names "conscientiousness" and "openness" as column names.

Source metadata (not part of the task):

- Source record: [verified row 66](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=66)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): CogSci_pattern_high_sim_data
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: analysis/cognitive_model_comparison/model_radar.py

## 68. ScienceAgentBench instance 68: Psychology and Cognitive science

> Visualize conscientiousness patterns in syllogistic reasoning using heatmaps. Process pre-computed weight matrices for high and low conscientiousness groups. Extract and compute a common pattern from these matrices. Generate a figure with three subplots: one each for high conscientiousness, low conscientiousness, and the common pattern. Save the resulting visualization as a PNG file in the 'pred_results/CogSci_pattern_high_com_low_plot_data_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 67](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=67)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): CogSci_pattern_high_com_low_plot_data
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: analysis/contrasts/plot_patterns.py

## 69. ScienceAgentBench instance 69: Bioinformatics

> For cell samples in the heart cell atlas dataset, filter out lowly expressed genes and plot UMAP results using the top 30 PCA components on the expression data. Save the UMAP visualization as 'pred_results/hca_cell_type_pca.png', with color representing the cell type.

Source metadata (not part of the task):

- Source record: [verified row 68](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=68)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Statistical Analysis, Data Visualization
- Dataset root(s): hca
- Upstream repository: [scverse/scvi-tutorials](https://github.com/scverse/scvi-tutorials)
- Upstream source path: quick_start/api_overview.ipynb

## 70. ScienceAgentBench instance 70: Bioinformatics

> Train a VAE model on the given data and perform a 1-vs-all differential expression test for each cell type. Extract top markers for each cell type using the results. Visualize them as a dotplot with the cell types organized using a dendrogram. Save the figure to pred_results/hca_cell_type_de.png.

Source metadata (not part of the task):

- Source record: [verified row 69](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=69)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Deep Learning, Computational Analysis, Data Visualization
- Dataset root(s): hca
- Upstream repository: [scverse/scvi-tutorials](https://github.com/scverse/scvi-tutorials)
- Upstream source path: quick_start/api_overview.ipynb

## 71. ScienceAgentBench instance 71: Psychology and Cognitive science

> Train a linear model to learn the mapping of neural representations in EEG signals from one subject (Sub 01) to another (Sub 03) based on the preprocessed EEG data from Sub 01 and Sub 03. Then use the test set of Subject 1 (Sub 01) to generate EEG signal of Subject 3 (Sub 03). Save the generated EEG signal of Subject 3 to 'pred_results/linear_sub01tosub03_pred.npy'.

Source metadata (not part of the task):

- Source record: [verified row 70](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=70)
- Domain: Psychology and Cognitive science
- Task categories: Feature Engineering, Machine Learning
- Dataset root(s): thingseeg2
- Upstream repository: [ZitongLu1996/EEG2EEG](https://github.com/ZitongLu1996/EEG2EEG)
- Upstream source path: models/LinearModel.ipynb

## 72. ScienceAgentBench instance 72: Psychology and Cognitive science

> Train a EEG2EEG model to learn the mapping of neural representations in EEG signals from one subject (Sub 01) to another (Sub 03) based on the preprocessed EEG data from Sub 01 and Sub 03. Then use the test set of Subject 1 (Sub 01) to generate EEG signal of Subject 3 (Sub 03). Save the generated EEG signal of Subject 3 to 'pred_results/eeg2eeg_sub01tosub03_pred.npy'.

Source metadata (not part of the task):

- Source record: [verified row 71](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=71)
- Domain: Psychology and Cognitive science
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): thingseeg2
- Upstream repository: [ZitongLu1996/EEG2EEG](https://github.com/ZitongLu1996/EEG2EEG)
- Upstream source path: models/EEG2EEG.ipynb

## 73. ScienceAgentBench instance 73: Psychology and Cognitive science

> Visualize the original and generated EEG signal of Sub-03 using a line plot. Images and channels corresponding to each timepoint should be averaged before plotting. Save the line plot to "pred_results/eeg2eeg_vis_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 72](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=72)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): eeg2eeg_vis
- Upstream repository: [ZitongLu1996/EEG2EEG](https://github.com/ZitongLu1996/EEG2EEG)
- Upstream source path: analysis/avgtrials_comparisons.py

## 74. ScienceAgentBench instance 74: Geographical Information Science

> I would like to simulate and display the change of glacier area and thickness for region 'RGI60-15.04847'. Use the OGGM library and perform a random simulation from year 2020 to year 2060. Use the data from year 1999 as your starting point and set halfsize to 5. Use 1.8 as the temperature bias. Show a comparison of distributed thickness from year 2020, 2040, and 2060 in three subplots. Set the maximum value of thickness to 300. Save the plot to 'pred_results/oggm_plotting_glacier_area_and_thickness_change_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 73](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=73)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Data Visualization
- Dataset root(s): ocean_glacier
- Upstream repository: [OGGM/oggm](https://github.com/OGGM/oggm)

## 75. ScienceAgentBench instance 75: Bioinformatics

> Train an amortized Latent Dirichlet Allocation (LDA) model with 10 topics on the PBMC 10K dataset. After training, compute topic proportions for each cell and visualize the topic proportions using UMAP. Save the plot as 'pred_results/topic_modeling_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 74](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=74)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Machine Learning, Data Visualization
- Dataset root(s): pbmc
- Upstream repository: [scverse/scvi-tutorials](https://github.com/scverse/scvi-tutorials)
- Upstream source path: scrna/amortized_lda.ipynb

## 76. ScienceAgentBench instance 76: Geographical Information Science

> Perform a random forest prospectivity analysis for tin-tungsten deposits in Tasmania. The analysis should focus on training and evaluating a model using Python tools on some mineral ocurrence point data and geo-related evidence raster leayers. Your goal is to set up the environment, load and inspect the data, build a random forest classifier model to identify the probability proximal of the area. The final auc should be at least 0.9. Save the final predicted graph as "pred_results/mineral_prospectivity.png"

Source metadata (not part of the task):

- Source record: [verified row 75](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=75)
- Domain: Geographical Information Science
- Task categories: Feature Engineering, Machine Learning, Map Visualization
- Dataset root(s): MineralProspectivity
- Upstream repository: [Solve-Geosolutions/transform_2022](https://github.com/Solve-Geosolutions/transform_2022)
- Upstream source path: transform_2022_tute.ipynb

## 77. ScienceAgentBench instance 77: Geographical Information Science

> Model water quality using spatial interpolation techniques in Python. The analysis should focus on understanding spatial patterns of water quality by using point sample data and interpolating these values across a broader area including unsampled locations. Your goal is to load the water quality sample data, and apply appropriate spatial interpolation methods, such as Kriging, to predict water quality across the region. The final output should be a map showing the interpolated water quality surface, saved as "pred_results/interploated_water_quality.png"

Source metadata (not part of the task):

- Source record: [verified row 76](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=76)
- Domain: Geographical Information Science
- Task categories: Statistical Analysis, Map Visualization
- Dataset root(s): WaterQuality
- Upstream repository: [Solve-Geosolutions/transform_2022](https://github.com/Solve-Geosolutions/transform_2022)

## 78. ScienceAgentBench instance 78: Bioinformatics

> Train a neural network model using the pucci dataset to predict the melting temperature (deltaTm) of proteins caused due to the point mutation of one amino acid at chain A. The dataset also contains the PDB files which need to be processed to retrieve the original (wild-type) amino acid sequence and then to create the mutated sequences. Save the predictions for the test set as a single column dataframe "deltaTm" to the file "pred_results/pucci-proteins_test_pred.csv".

Source metadata (not part of the task):

- Source record: [verified row 77](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=77)
- Domain: Bioinformatics
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): pucci
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Protein_Deep_Learning.ipynb

## 79. ScienceAgentBench instance 79: Bioinformatics

> Using the data provided, compute for each cell the number of genes found in the cell's expression counts. Plot the distribution of this computation using a violin plot. Overlay the violin plot with a strip plot showing the same data. Store the result to 'pred_results/violin.png'.

Source metadata (not part of the task):

- Source record: [verified row 78](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=78)
- Domain: Bioinformatics
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): violin
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: basic-scrna-tutorial.ipynb

## 80. ScienceAgentBench instance 80: Bioinformatics

> For the data in provided, plot a scatter plot where the x-axis is the total number of counts per cell and the y-axis is number of genes found in the cell's expression counts. Color each point by the percentage of counts in that cell that are for mitochondrial genes. Store the result to 'pred_results/genes_scatter.png'.

Source metadata (not part of the task):

- Source record: [verified row 79](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=79)
- Domain: Bioinformatics
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): violin
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: basic-scrna-tutorial.ipynb

## 81. ScienceAgentBench instance 81: Bioinformatics

> For the given gene expression dataset, perform a scatter plot in UMAP basis to visualize groups of cells that express popular marker genes across various cell types: T-cell, B-cell, plasma, monocytes and dendritic. Also add plots for number of UMI counts per cell and bulk labels per cell. Save all the plots as one figure to 'pred_results/umap.png'.

Source metadata (not part of the task):

- Source record: [verified row 80](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=80)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): pbmc_umap
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: plotting/core.ipynb

## 82. ScienceAgentBench instance 82: Bioinformatics

> For the given data in 'pbmc_umap/pbmc.h5ad', visualize the dendrogram of the 'bulk_labels' variable. Save the results to 'pred_results/dendrogram.png'

Source metadata (not part of the task):

- Source record: [verified row 81](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=81)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): pbmc_umap
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: plotting/core.ipynb

## 83. ScienceAgentBench instance 83: Geographical Information Science

> Your task is to analyze urban heat using Kriging interpolation techniques in Python. The analysis should focus on understanding spatial patterns of urban heat islands by using point temperature data and interpolating these values across a city. You also have to use a demographical layer to extract and enhance the data visualization on the elder group. Your goal is to load the temperature sample data, apply the Kriging method to predict temperature across the urban area, and generate a choropleth map showing the average interpolated temperature surface in each census block group. The final output should be saved as "pred_results/interpolated_urban_heat.png".

Source metadata (not part of the task):

- Source record: [verified row 82](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=82)
- Domain: Geographical Information Science
- Task categories: Geospatial Analysis, Map Visualization
- Dataset root(s): UrbanHeat
- Upstream repository: [https://github.com/GeoStat-Framework/PyKrige](https://github.com/GeoStat-Framework/PyKrige)

## 84. ScienceAgentBench instance 84: Geographical Information Science

> Assess burn scars using satellite imagery and perform spatial analysis to understand the impact of wildfires. The goal is to use the satellite imagery data from 2014 and 2015 on analyzing burn scars by determining the change in Normalized Burn Ratio, and generate a map that visualizes the spatial extent of the damage areas in vector data format (i.e., polygons). The final output should be a visual representation of the burn scars, saved as "pred_results/burn_scar_analysis.png".

Source metadata (not part of the task):

- Source record: [verified row 83](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=83)
- Domain: Geographical Information Science
- Task categories: Computational Analysis, Map Visualization
- Dataset root(s): BurnScar
- Upstream repository: [rasterio/rasterio](https://github.com/rasterio/rasterio)

## 85. ScienceAgentBench instance 85: Bioinformatics

> Analyze the given saliva data and compute features that represent sample statistics or distribution (e.g., mean, location of max/min value, skewness) for each subject. Save the computed features along with subject condition as a dictionary of dictionaries into a json file "pred_results/saliva_pred.json".

Source metadata (not part of the task):

- Source record: [verified row 84](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=84)
- Domain: Bioinformatics
- Task categories: Feature Engineering
- Dataset root(s): saliva_data
- Upstream repository: [mad-lab-fau/BioPsyKit](https://github.com/mad-lab-fau/BioPsyKit)
- Upstream source path: examples/Saliva_Example.ipynb

## 86. ScienceAgentBench instance 86: Geographical Information Science

> Load Total Electron Content (TEC) data from a space weather NetCDF file and visualize it as a filled contour map with a geographical and coastline background. Save the figure as 'pred_results/TEC_vis.png'.

Source metadata (not part of the task):

- Source record: [verified row 85](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=85)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): total_electron_content
- Upstream repository: [SciTools/iris](https://github.com/SciTools/iris)
- Upstream source path: docs/gallery_code/meteorology/plot_TEC.py

## 87. ScienceAgentBench instance 87: Geographical Information Science

> Load North America climate data in NetCDF file and extract temperature data along the time series, then perform a quadratic polynomial fit analysis on the temperature data, and output the fitting results by year in 'pred_results/polynomial_fit_pred.csv'.

Source metadata (not part of the task):

- Source record: [verified row 86](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=86)
- Domain: Geographical Information Science
- Task categories: Statistical Analysis
- Dataset root(s): polynomial_fit
- Upstream repository: [SciTools/iris](https://github.com/SciTools/iris)
- Upstream source path: docs/gallery_code/general/plot_polynomial_fit.py

## 88. ScienceAgentBench instance 88: Geographical Information Science

> Use data on the locations and related information of fatal car crashes in New York City, along with the GeoJSON data of NYC administrative regions, plot the geographical distribution of fatal crashes in 2016 on a map. Save the figure as 'pred_results/collisions_map_vis.png'.

Source metadata (not part of the task):

- Source record: [verified row 87](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=87)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): nyc_collisions_map
- Upstream repository: [ResidentMario/geoplot](https://github.com/ResidentMario/geoplot)
- Upstream source path: examples/plot_nyc_collisions_map.py

## 89. ScienceAgentBench instance 89: Geographical Information Science

> Use the GeoJSON data about San Francisco street trees and administrative regions, analyze the tree species NULL percentage in different regions, and visualize this analysis in a quadtree format map. Save the figure as 'pred_results/trees_count_vis.png'.

Source metadata (not part of the task):

- Source record: [verified row 88](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=88)
- Domain: Geographical Information Science
- Task categories: Map Visualization
- Dataset root(s): sfo_trees_count
- Upstream repository: [ResidentMario/geoplot](https://github.com/ResidentMario/geoplot)
- Upstream source path: examples/plot_san_francisco_trees.py

## 90. ScienceAgentBench instance 90: Psychology and Cognitive science

> Perform Non-negative matrix factorization for the matrices X1 and X2 given in jnmf_data. X1 should be factorized into two matrices W_high and H_high, where the product of W_high and H_high's transpose should be close to X1. Similarly, X2 should be factorized into W_low and H_low. Store the resulting factorized matrices as pred_results/fit_result_conscientiousness_{W_high/W_low/H_high/H_low}.npy.

Source metadata (not part of the task):

- Source record: [verified row 89](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=89)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): jnmf_data
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: jnmf/

## 91. ScienceAgentBench instance 91: Psychology and Cognitive science

> Use the given matrices W_high and W_low in the jnmf_visualization dataset to visualize the high/common/low consciousness patterns. The high consciousness patterns are those in the second column of W_high, the low consciousness patterns are those in the second column of W_low, and the common patterns are the average of the first columns of W_high and W_low. Reshape every pattern into a (64, 9) matrix and plot it as a heatmap. The three patterns should go from left to right in 3 subplots. Save the results to pred_results/patterns_conscientiousness.png.

Source metadata (not part of the task):

- Source record: [verified row 90](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=90)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): jnmf_visualization
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: analysis/contrasts/plot_patterns.py

## 92. ScienceAgentBench instance 92: Psychology and Cognitive science

> Compute a set of importance factors given the factor matrices W_high, W_low, H_high, H_low given in the jnmf_visualization dataset. The factors are the following:
> 1. common error: one minus the inner product of the first column of W_high and W_low.
> 2. common importance: the sum of entries in the first column of H_high and H_low, divided by the sum of all entries in H_high and H_low.
> 3. high importance: sum of entries in the second column of H_high divided by sum of all entries in H_high.
> 4. low importance: sum of entries in the second column of H_low divided by sum of all entries in H_low.
> 5. distinct error: inner product of the second columns of W_high and W_low
> 6. distinct importance: the sum of entries in the second column of H_high and H_low, divided by the sum of all entries in H_high and H_low.
> Store the scores in a dictionary where each factor name maps to its score value. Save the dictionary as a json file to "pred_results/jnmf_h_importances.json".

Source metadata (not part of the task):

- Source record: [verified row 91](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=91)
- Domain: Psychology and Cognitive science
- Task categories: Computational Analysis
- Dataset root(s): jnmf_visualization
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: /analysis/model_evaluation/h_importances.py

## 93. ScienceAgentBench instance 93: Psychology and Cognitive science

> Using the given matrix data in fit_result_conscientiousness_H_low.npy and fit_result_conscientiousness_H_high.npy, plot the data distributions. Specifically, you should have three plots: the "high" split is given by the values in the second column of H_high; the "low" split is given by the second column of H_low, and the "common" split is given by the concatenation of values from the first column of H_high and H_low. All values should be rescaled s.t. the largest values among all is 1.0. You should have three subplots (from left to right) for "high", "common", "low" correspondingly. Save the result figure to pred_results/H_distribution_conscientiousness.png.

Source metadata (not part of the task):

- Source record: [verified row 92](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=92)
- Domain: Psychology and Cognitive science
- Task categories: Data Visualization
- Dataset root(s): jnmf_visualization
- Upstream repository: [brand-d/cogsci-jnmf](https://github.com/brand-d/cogsci-jnmf)
- Upstream source path: analysis/model_evaluation/plot_h_distribution.py

## 94. ScienceAgentBench instance 94: Computational Chemistry

> Visuzalize the molecule in the file 'molecule_ZINC001754572633.pkl' with a graph, which is a rdkit.Chem.rdchem.Mol object, using the rdkit and networkx library. You should use orange for Carbon (C) atoms, magenta for Oxygen (O) atoms, and cyan for Nitrogen (N) atoms. Use the spring layout with random seed set to 10 when drawing the molecue. Set the node size to 800 and add labels to the nodes. Save the plot to 'pred_results/polyverse_visualize_molecules_pred.png'.

Source metadata (not part of the task):

- Source record: [verified row 93](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=93)
- Domain: Computational Chemistry
- Task categories: Molecule Visualization
- Dataset root(s): polyverse_viz
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/An_Introduction_to_the_Polymers_and_Their_Representation.ipynb

## 95. ScienceAgentBench instance 95: Computational Chemistry

> Train a synthetic feasibility model using the NumpyDataset in the train_mols.pkl file of the tox21 dataset. Use the ScScore model from deepchem. Featurize all our molecules with the ECFP fingerprint with chirality. Use radius 2 and 512 feature dimensions. Create a training set of 100000 molecue pairs and fit the model for 20 epochs. Use the length of smiles as the ground truth complexity metric. After that, predict the complexity scores for the molecues in the test_mols.pkl file. Save the predicted scores to 'pred_results/tox21_mol_scscores_pred.npy' using numpy.save().

Source metadata (not part of the task):

- Source record: [verified row 94](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=94)
- Domain: Computational Chemistry
- Task categories: Feature Engineering, Deep Learning
- Dataset root(s): tox21
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Synthetic_Feasibility_Scoring.ipynb

## 96. ScienceAgentBench instance 96: Bioinformatics

> Analyze the preprocessed PBMC dataset with precomputed UMAP components for 700 cells and 765 highly variable genes. Compute clusters using the Leiden method and visualize the clustering results with UMAP. Save the figure to "pred_results/scatter_pred.png".

Source metadata (not part of the task):

- Source record: [verified row 95](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=95)
- Domain: Bioinformatics
- Task categories: Data Visualization
- Dataset root(s): pbmc68k
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: plotting/core.ipynb

## 97. ScienceAgentBench instance 97: Computational Chemistry

> Train a fromation energy prediction model using the NumpyDataset in the perovskite_train.pkl file of the perovskite dataset. Use the CGCNN regression model from deepchem. After that, predict the formation energy for the molecues in the test set. Save the predicted scores to 'pred_results/formation_energy_prediction_pred.txt' using numpy.savetxt().

Source metadata (not part of the task):

- Source record: [verified row 96](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=96)
- Domain: Computational Chemistry
- Task categories: Deep Learning
- Dataset root(s): perovskite
- Upstream repository: [deepchem/deepchem](https://github.com/deepchem/deepchem)
- Upstream source path: examples/tutorials/Introduction_To_Material_Science.ipynb

## 98. ScienceAgentBench instance 98: Bioinformatics

> Compute chain quality control information for this single-cell TCR/RNA-seq data collected from resected tumors, histologically normally adjacent tissues (NAT), and peripheral blood. Then, draw a stacked bar chart of the number of cells in each chain pairing, coloring each portion of the stack by the source (tumor, NAT, or blood).  The figure should be saved as pred_results/3k_pred.png.

Source metadata (not part of the task):

- Source record: [verified row 97](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=97)
- Domain: Bioinformatics
- Task categories: Computational Analysis, Data Visualization
- Dataset root(s): cell_3k
- Upstream repository: [scverse/scirpy](https://github.com/scverse/scirpy)
- Upstream source path: docs/tutorials/tutorial_3k_tcr.ipynb

## 99. ScienceAgentBench instance 99: Bioinformatics

> You should draw three UMAP figures of the data colored by total_counts, n_genes_by_counts, and clusters, respectively. You should put the three figures in one picture, and save it to pred_results/spatial_pred.png.

Source metadata (not part of the task):

- Source record: [verified row 98](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=98)
- Domain: Bioinformatics
- Task categories: Statistical Analysis, Data Visualization
- Dataset root(s): lymph
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: spatial/basic-analysis.ipynb

## 100. ScienceAgentBench instance 100: Bioinformatics

> You should visualize the data in spatial coordinates in three figures colored by total_counts, n_genes_by_counts, and clusters, respectively. You should put the three figures in one picture, and save it to pred_results/spatial_2_pred.png.

Source metadata (not part of the task):

- Source record: [verified row 99](https://huggingface.co/datasets/osunlp/ScienceAgentBench/viewer/default/verified?row=99)
- Domain: Bioinformatics
- Task categories: Statistical Analysis, Data Visualization
- Dataset root(s): lymph
- Upstream repository: [scverse/scanpy-tutorials](https://github.com/scverse/scanpy-tutorials)
- Upstream source path: spatial/basic-analysis.ipynb
